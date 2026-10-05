//! Images and other files used by notes.
//!
//! They are ordinary files in one `attachments/` folder at the root of the
//! notes folder. Notes link to them with relative Markdown links
//! (`![](../attachments/diagram.png)`, `[Report.pdf](../attachments/Report.pdf)`),
//! so other Markdown editors find them too. The web view never reads files
//! itself: it shows images through the `linotes-image:` protocol, which serves
//! only image files inside the notes folder (see `crate::images`), and asks
//! the backend to open other files.

use super::Library;
use super::library::{lowercase_names, read_note_file};
use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::ATTACHMENTS_DIR;
use crate::filesystem::atomic::{write_atomic, write_new_atomic};
use crate::filesystem::safe_path::{self, MAX_REL_PATH_BYTES, join_rel};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io;
use std::ops::Range;
use std::path::{Path, PathBuf};

/// Largest image that can be added to a note.
pub const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
/// Largest image file that is shown (files added elsewhere may be bigger).
const MAX_SHOWN_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
/// Extensions of files that may be shown as images.
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"];
/// Largest file of any other kind that can be attached to a note.
pub const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;
/// Linked files of these kinds open in their usual app. Anything else (scripts,
/// programs, launchers…) is shown in Files instead, so a note can't start a program.
const OPENABLE_EXTENSIONS: &[&str] = &[
    "pdf", "txt", "md", "csv", "rtf", "odt", "ods", "odp", "odg", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "epub",
    "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "mp3", "ogg", "oga", "opus", "wav", "flac", "m4a",
    "mp4", "m4v", "webm", "mkv", "mov", "avi", "zip", "7z", "tar", "gz", "xz", "bz2",
];
/// File names that say nothing about the file; such files are named by time instead.
const GENERIC_NAMES: &[&str] = &["image", "img", "clipboard", "pasted", "untitled", "download"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Avif,
    Bmp,
    Svg,
}

impl ImageKind {
    /// Recognise an image by its first bytes; file names are never trusted.
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        let at = |range: Range<usize>| bytes.get(range);
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Self::Png)
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(Self::Jpeg)
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Some(Self::Gif)
        } else if at(0..4) == Some(b"RIFF") && at(8..12) == Some(b"WEBP") {
            Some(Self::Webp)
        } else if at(4..8) == Some(b"ftyp") && matches!(at(8..12), Some(b"avif" | b"avis")) {
            Some(Self::Avif)
        } else if bytes.starts_with(b"BM")
            && at(14..18).is_some_and(|size| matches!(size[0], 12 | 40 | 52 | 56 | 64 | 108 | 124))
        {
            Some(Self::Bmp)
        } else if looks_like_svg(bytes) {
            Some(Self::Svg)
        } else {
            None
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Bmp => "bmp",
            Self::Svg => "svg",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
            Self::Avif => "image/avif",
            Self::Bmp => "image/bmp",
            Self::Svg => "image/svg+xml",
        }
    }
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]);
    let text = head.trim_start_matches('\u{feff}').trim_start();
    ["<svg", "<?xml", "<!--", "<!DOCTYPE svg"].iter().any(|start| text.starts_with(start)) && head.contains("<svg")
}

/// A file added to a note: an image to show, or any other file to link to.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedFile {
    /// The link to put in the note, relative to the note's folder.
    pub link: String,
    /// Library-relative path of the stored file.
    pub path: String,
    /// The file's own name, for the link text.
    pub name: String,
    pub image: bool,
}

/// What to do with a file a note links to.
#[derive(Debug, PartialEq, Eq)]
pub enum LinkedFile {
    /// Open it in its usual app.
    Open(PathBuf),
    /// Show it in Files (a kind of file Linotes doesn't start).
    Reveal(PathBuf),
}

impl Library {
    /// Store an image for a note in `attachments/` (never overwriting a file)
    /// and return the link the note should use.
    pub fn save_image(&mut self, note_id: &str, name: &str, bytes: &[u8]) -> AppResult<AddedFile> {
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(AppError::invalid("Images can be at most 25 MB."));
        }
        let kind = ImageKind::sniff(bytes).ok_or_else(|| {
            AppError::invalid("Only PNG, JPEG, GIF, WebP, AVIF, BMP and SVG images can be added to notes.")
        })?;
        let folder = self.writable_folder(note_id)?;
        let path = self.store(&attachment_stem(name), kind.extension(), bytes)?;
        Ok(AddedFile { link: relative_path(&folder, &path), path, name: name.to_string(), image: true })
    }

    /// Add a file from this computer (dropped or pasted) to a note: images
    /// become images, any other file an attachment the note links to.
    pub fn add_file(&mut self, note_id: &str, source: &Path) -> AppResult<AddedFile> {
        let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let meta = fs::metadata(source).with_path("read", source)?;
        if !meta.is_file() {
            return Err(AppError::invalid(format!("“{name}” is a folder; only files can be added to a note.")));
        }
        if meta.len() > MAX_FILE_BYTES {
            return Err(AppError::invalid(format!("“{name}” is larger than 100 MB.")));
        }
        let folder = self.writable_folder(note_id)?;
        let bytes = fs::read(source).with_path("read", source)?;
        let (path, image) = match ImageKind::sniff(&bytes) {
            Some(kind) if bytes.len() <= MAX_IMAGE_BYTES => {
                (self.store(&attachment_stem(&name), kind.extension(), &bytes)?, true)
            }
            _ => (self.store(&attachment_stem(&name), &file_extension(&name), &bytes)?, false),
        };
        Ok(AddedFile { link: relative_path(&folder, &path), path, name, image })
    }

    /// What to do with `link`, a link from the note to a file: open it, or
    /// show it in Files. Only files inside the notes folder are considered.
    pub fn linked_file(&self, note_id: &str, link: &str) -> AppResult<LinkedFile> {
        let not_found = || AppError::not_found("That file isn’t in the notes folder.");
        let row = self.row(note_id)?;
        let target = percent_decode(link);
        if !is_relative_path(&target) {
            return Err(not_found());
        }
        let rel =
            relink(&row.summary.folder, "", &target).filter(|rel| !rel.starts_with("../")).ok_or_else(not_found)?;
        let path = checked_file(&self.root, &rel).ok_or_else(not_found)?;
        let extension = file_extension(&rel);
        if OPENABLE_EXTENSIONS.contains(&extension.as_str()) && !is_executable(&path) {
            Ok(LinkedFile::Open(path))
        } else {
            Ok(LinkedFile::Reveal(path))
        }
    }

    /// The folder new links in the note are relative to; trashed notes can't be edited.
    fn writable_folder(&self, note_id: &str) -> AppResult<String> {
        let row = self.row(note_id)?;
        if row.summary.trashed {
            return Err(AppError::invalid("Notes in the trash can’t be edited. Restore the note first."));
        }
        Ok(row.summary.folder)
    }

    /// Write a file into `attachments/` under a free name; returns its library-relative path.
    pub(crate) fn store(&self, stem: &str, extension: &str, bytes: &[u8]) -> AppResult<String> {
        let dir = self.attachments_dir()?;
        let mut attempts = 0;
        loop {
            let taken = lowercase_names(&dir);
            let name = free_name(stem, extension, |n| taken.contains(&n.to_lowercase()));
            match write_new_atomic(&dir.join(&name), bytes) {
                Ok(()) => return Ok(join_rel(ATTACHMENTS_DIR, &name)),
                Err(AppError::AlreadyExists(_)) if attempts < 5 => attempts += 1,
                Err(err) => return Err(err),
            }
        }
    }

    /// `attachments/`, created on first use. It must be a real folder, not a link elsewhere.
    fn attachments_dir(&self) -> AppResult<PathBuf> {
        let dir = self.root.join(ATTACHMENTS_DIR);
        match fs::create_dir(&dir) {
            Ok(()) => {}
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {}
            Err(err) => return Err(err).with_path("create", &dir),
        }
        let meta = dir.symlink_metadata().with_path("open", &dir)?;
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(AppError::invalid(format!(
                "“{ATTACHMENTS_DIR}” in the notes folder must be a folder for Linotes to store images in it."
            )));
        }
        Ok(dir)
    }

    /// After a note moved from folder `from` to `to`, keep its image and file links working.
    /// The move has already happened, so a failure here is only logged.
    pub(super) fn relink_moved_note(&self, rel: &str, from: &str, to: &str) {
        let path = self.abs(rel);
        let result = read_note_file(&path).and_then(|mut file| match relink_files(&file.body, from, to) {
            Some(body) => {
                file.body = body;
                write_atomic(&path, file.serialize().as_bytes())
            }
            None => Ok(()),
        });
        if let Err(err) = result {
            log::warn!("Could not update the links of {rel}: {err}");
        }
    }
}

/// Images copied while importing notes, so that each file is copied once.
#[derive(Default)]
pub struct ImportedImages {
    copied: HashMap<PathBuf, String>,
}

impl ImportedImages {
    pub fn contains(&self, source: &Path) -> bool {
        self.copied.contains_key(source)
    }
}

impl Library {
    /// Copy the local images an imported note links to into `attachments/` and
    /// point its links there. Only images inside `allowed` (the imported
    /// folder, or the folder of an imported file) are copied; other links stay.
    pub fn import_images(
        &self,
        body: &str,
        source_dir: &Path,
        allowed: &Path,
        folder: &str,
        images: &mut ImportedImages,
    ) -> Option<String> {
        map_links(body, Links::Images, |target| {
            if !is_relative_path(target) {
                return None;
            }
            let source = source_dir.join(target).canonicalize().ok()?;
            if !source.starts_with(allowed) {
                return None;
            }
            let path = match images.copied.get(&source) {
                Some(path) => path.clone(),
                None => {
                    let path = self.copy_image(&source)?;
                    images.copied.insert(source, path.clone());
                    path
                }
            };
            Some(relative_path(folder, &path))
        })
    }

    fn copy_image(&self, source: &Path) -> Option<String> {
        let meta = fs::metadata(source).ok()?;
        if !meta.is_file() || meta.len() > MAX_IMAGE_BYTES as u64 {
            return None;
        }
        let bytes = fs::read(source).ok()?;
        let kind = ImageKind::sniff(&bytes)?;
        let name = source.file_name()?.to_string_lossy();
        self.store(&attachment_stem(&name), kind.extension(), &bytes)
            .map_err(|err| log::warn!("Could not import the image {}: {err}", source.display()))
            .ok()
    }
}

/// The file a library-relative image path points to, if it may be shown: an
/// image file inside the notes folder, reached without `..`, hidden folders or
/// links that lead elsewhere.
pub fn image_file(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let not_found = || AppError::not_found("Image not found");
    if !IMAGE_EXTENSIONS.contains(&file_extension(rel).as_str()) {
        return Err(not_found());
    }
    let path = checked_file(root, rel).ok_or_else(not_found)?;
    if fs::metadata(&path).map_err(|_| not_found())?.len() > MAX_SHOWN_IMAGE_BYTES {
        return Err(not_found());
    }
    Ok(path)
}

/// The regular file a library-relative path points to, reached without `..`,
/// hidden folders or links that lead out of the notes folder.
fn checked_file(root: &Path, rel: &str) -> Option<PathBuf> {
    let valid = !rel.is_empty()
        && rel.len() <= MAX_REL_PATH_BYTES
        && !rel.contains(['\\', '\0'])
        && rel.split('/').all(|part| !part.is_empty() && !part.starts_with('.') && !part.chars().any(char::is_control));
    let path = root.join(rel);
    (valid && fs::metadata(&path).is_ok_and(|meta| meta.is_file()) && safe_path::ensure_inside(root, &path).is_ok())
        .then_some(path)
}

fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path).is_ok_and(|meta| meta.permissions().mode() & 0o111 != 0)
}

/// Read an image for display; its type comes from its content.
pub fn read_image(root: &Path, rel: &str) -> AppResult<(ImageKind, Vec<u8>)> {
    let path = image_file(root, rel)?;
    let bytes = fs::read(&path).with_path("read", &path)?;
    let kind = ImageKind::sniff(&bytes).ok_or_else(|| AppError::not_found("Not an image"))?;
    Ok((kind, bytes))
}

// ----- Names and paths -------------------------------------------------------

/// A readable file stem without spaces (links stay simple), or one based on the time.
pub(crate) fn attachment_stem(name: &str) -> String {
    let stem = Path::new(name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut out = String::new();
    for ch in stem.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            out.push(ch);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out: String = out.trim_end_matches('-').chars().take(60).collect();
    let out = out.trim_end_matches('-');
    if out.is_empty() || GENERIC_NAMES.contains(&out.to_lowercase().as_str()) {
        format!("image-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"))
    } else {
        out.to_string()
    }
}

/// The lowercase extension of a file name (`""` if it has none or an odd one).
fn file_extension(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && ext.len() <= 10 && ext.chars().all(|c| c.is_ascii_alphanumeric()) => {
            ext.to_ascii_lowercase()
        }
        _ => String::new(),
    }
}

/// `stem.ext`, `stem-2.ext`, `stem-3.ext`… — the first name `taken` rejects.
fn free_name(stem: &str, extension: &str, taken: impl Fn(&str) -> bool) -> String {
    let name = |suffix: String| {
        if extension.is_empty() { format!("{stem}{suffix}") } else { format!("{stem}{suffix}.{extension}") }
    };
    (1..)
        .map(|n| name(if n == 1 { String::new() } else { format!("-{n}") }))
        .find(|candidate| !taken(candidate))
        .expect("unbounded iterator always finds a free name")
}

/// Link from a note in `from_folder` to the library-relative file `target`.
pub fn relative_path(from_folder: &str, target: &str) -> String {
    let from: Vec<&str> = from_folder.split('/').filter(|p| !p.is_empty()).collect();
    let to: Vec<&str> = target.split('/').collect();
    let dirs = &to[..to.len() - 1];
    let common = from.iter().zip(dirs).take_while(|(a, b)| a == b).count();
    let mut parts = vec![".."; from.len() - common];
    parts.extend(&to[common..]);
    parts.join("/")
}

/// Whether a link target is a relative file path (not a web address, an
/// absolute path, an anchor or a link with a query).
pub fn is_relative_path(target: &str) -> bool {
    if target.is_empty() || target.starts_with(['/', '#']) || target.contains(['?', '#']) {
        return false;
    }
    let scheme = target.split_once(':').map(|(scheme, _)| scheme);
    !scheme.is_some_and(|s| {
        s.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    })
}

/// Decode `%XX` sequences (file links are URLs: `my%20image.png` is `my image.png`).
pub fn percent_decode(text: &str) -> String {
    if !text.contains('%') {
        return text.to_string();
    }
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = bytes.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok());
        match (bytes[i], hex.and_then(|h| u8::from_str_radix(h, 16).ok())) {
            (b'%', Some(byte)) => {
                out.push(byte);
                i += 3;
            }
            (byte, _) => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

// ----- Rewriting links ---------------------------------------------------------

/// Image and file links of a note that moved from folder `from` to `to`,
/// recomputed so they point at the same files. Web addresses, absolute paths
/// and anchors are left alone. `None` if nothing changes.
pub fn relink_files(body: &str, from: &str, to: &str) -> Option<String> {
    if from == to {
        return None;
    }
    map_links(body, Links::All, |target| is_relative_path(target).then(|| relink(from, to, target)).flatten())
}

/// `target`, a link from folder `from`, rewritten as a link from folder `to` to
/// the same file. Links that lead out of the notes folder keep doing so.
fn relink(from: &str, to: &str, target: &str) -> Option<String> {
    let mut above_root = 0;
    let mut parts: Vec<&str> = from.split('/').filter(|p| !p.is_empty()).collect();
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    above_root += 1;
                }
            }
            part => parts.push(part),
        }
    }
    if parts.is_empty() {
        return None;
    }
    if above_root == 0 {
        return Some(relative_path(to, &parts.join("/")));
    }
    let depth = to.split('/').filter(|p| !p.is_empty()).count();
    Some(format!("{}{}", "../".repeat(depth + above_root), parts.join("/")))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Links {
    Images,
    All,
}

/// Replace the destinations of inline image links (and, with `Links::All`,
/// other links). `map` gets each destination (unescaped and percent-decoded)
/// and returns a new one, or `None` to keep it. Everything else in `body`
/// stays byte for byte. `None` if nothing changed.
pub fn map_links(body: &str, which: Links, mut map: impl FnMut(&str) -> Option<String>) -> Option<String> {
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    for (event, range) in Parser::new_ext(body, options).into_offset_iter() {
        let dest_url = match event {
            Event::Start(Tag::Image { dest_url, .. }) => dest_url,
            Event::Start(Tag::Link { dest_url, .. }) if which == Links::All => dest_url,
            _ => continue,
        };
        let Some(dest) = destination(body, range) else { continue };
        let raw = &body[dest.inner.clone()];
        // Only edit what was certainly found: the raw text must be this destination.
        if unescape(raw) != *dest_url {
            continue;
        }
        let current = percent_decode(&dest_url);
        let Some(target) = map(&current) else { continue };
        if target != current {
            edits.push((dest.outer, encode_destination(&target, dest.angle, raw.contains('%'))));
        }
    }
    if edits.is_empty() {
        return None;
    }
    // From the end backwards, so earlier positions stay valid (a link can wrap an image).
    edits.sort_by_key(|(range, _)| std::cmp::Reverse(range.start));
    let mut out = body.to_string();
    for (range, text) in edits {
        out.replace_range(range, &text);
    }
    Some(out)
}

struct Destination {
    /// Including `<…>` when the link uses them.
    outer: Range<usize>,
    inner: Range<usize>,
    angle: bool,
}

/// Where the destination of the inline link `[text](dest "title")` or image
/// `![alt](dest)` at `link` is.
fn destination(body: &str, link: Range<usize>) -> Option<Destination> {
    let source = body.get(link.clone())?;
    let bytes = source.as_bytes();
    let open = usize::from(source.starts_with('!'));
    if bytes.get(open) != Some(&b'[') || !source.ends_with(')') {
        return None; // A reference link or an autolink: no inline destination.
    }
    let mut i = open;
    let mut depth = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }
        i += 1;
    }
    if bytes.get(i + 1) != Some(&b'(') {
        return None;
    }
    let mut start = i + 2;
    while bytes.get(start).is_some_and(|b| b.is_ascii_whitespace()) {
        start += 1;
    }
    let offset = |range: Range<usize>| link.start + range.start..link.start + range.end;
    if bytes.get(start) == Some(&b'<') {
        let mut end = start + 1;
        while end < bytes.len() && bytes[end] != b'>' {
            end += if bytes[end] == b'\\' { 2 } else { 1 };
        }
        if end >= bytes.len() {
            return None;
        }
        return Some(Destination { outer: offset(start..end + 1), inner: offset(start + 1..end), angle: true });
    }
    let mut end = start;
    let mut parens = 0;
    while end < bytes.len() {
        match bytes[end] {
            b'\\' => end += 1,
            b'(' => parens += 1,
            b')' if parens == 0 => break,
            b')' => parens -= 1,
            b if b.is_ascii_whitespace() => break,
            _ => {}
        }
        end += 1;
    }
    (end > start).then(|| Destination { outer: offset(start..end), inner: offset(start..end), angle: false })
}

/// Remove backslash escapes of ASCII punctuation, as Markdown does in link destinations.
fn unescape(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' && chars.peek().is_some_and(|next| next.is_ascii_punctuation()) {
            continue;
        }
        out.push(ch);
    }
    out
}

/// Write a destination in the style the note already used for it.
fn encode_destination(target: &str, angle: bool, percent: bool) -> String {
    if percent {
        let mut out = String::with_capacity(target.len());
        for ch in target.chars() {
            match ch {
                ' ' => out.push_str("%20"),
                '%' => out.push_str("%25"),
                '(' => out.push_str("%28"),
                ')' => out.push_str("%29"),
                '<' => out.push_str("%3C"),
                '>' => out.push_str("%3E"),
                ch => out.push(ch),
            }
        }
        return if angle { format!("<{out}>") } else { out };
    }
    if angle || target.chars().any(|c| c.is_whitespace() || c == '<' || c == '>') {
        return format!("<{}>", target.replace('<', "%3C").replace('>', "%3E"));
    }
    target.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    #[test]
    fn recognises_images_by_content() {
        assert_eq!(ImageKind::sniff(PNG), Some(ImageKind::Png));
        assert_eq!(ImageKind::sniff(&[0xFF, 0xD8, 0xFF, 0xE0]), Some(ImageKind::Jpeg));
        assert_eq!(ImageKind::sniff(b"GIF89a...."), Some(ImageKind::Gif));
        assert_eq!(ImageKind::sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some(ImageKind::Webp));
        assert_eq!(ImageKind::sniff(b"\0\0\0\x1cftypavif\0\0"), Some(ImageKind::Avif));
        assert_eq!(ImageKind::sniff(b"BM\0\0\0\0\0\0\0\0\0\0\0\0\x28\0\0\0"), Some(ImageKind::Bmp));
        assert_eq!(ImageKind::sniff(b"<?xml version=\"1.0\"?>\n<svg xmlns=\"\"></svg>"), Some(ImageKind::Svg));
        assert_eq!(ImageKind::sniff(b"\xEF\xBB\xBF  <svg></svg>"), Some(ImageKind::Svg));
        for not_image in [&b"BMW is a car"[..], b"# A note", b"<html><body>", b"%PDF-1.7", b""] {
            assert_eq!(ImageKind::sniff(not_image), None, "{not_image:?}");
        }
    }

    #[test]
    fn image_names_are_readable_and_free_of_spaces() {
        assert_eq!(attachment_stem("Screenshot From 2026-10-04 18-30-12.png"), "Screenshot-From-2026-10-04-18-30-12");
        assert_eq!(attachment_stem("Görsel (1).jpeg"), "Görsel-1");
        assert_eq!(attachment_stem("../../etc/passwd"), "passwd");
        assert!(attachment_stem("image.png").starts_with("image-20"));
        assert!(attachment_stem("").starts_with("image-"));
        assert!(attachment_stem(" .png").starts_with("image-"));
        assert_eq!(free_name("a", "png", |n| n == "a.png" || n == "a-2.png"), "a-3.png");
    }

    #[test]
    fn relative_links_between_folders() {
        assert_eq!(relative_path("", "attachments/a.png"), "attachments/a.png");
        assert_eq!(relative_path("Work", "attachments/a.png"), "../attachments/a.png");
        assert_eq!(relative_path("Work/Projects", "attachments/a.png"), "../../attachments/a.png");
        assert_eq!(relative_path("Work", "Work/diagram.png"), "diagram.png");
        assert_eq!(relative_path("Work/Projects", "Work/diagram.png"), "../diagram.png");
        assert_eq!(relink("Work", "", "../attachments/a.png").as_deref(), Some("attachments/a.png"));
        assert_eq!(relink("Work", "Work", "./img/../a.png").as_deref(), Some("a.png"));
        assert_eq!(relink("", "Work", "../outside.png").as_deref(), Some("../../outside.png"));
        assert_eq!(relink("Work", "", ".."), None);
    }

    #[test]
    fn only_relative_paths_count_as_files() {
        for yes in ["a.png", "../attachments/a.png", "dir/a b.png", "C++/a.png"] {
            assert!(is_relative_path(yes), "{yes}");
        }
        for no in
            ["https://x.org/a.png", "data:image/png;base64,AA", "/etc/a.png", "#top", "a.png?v=1", "file:a.png", ""]
        {
            assert!(!is_relative_path(no), "{no}");
        }
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("my%20image.png"), "my image.png");
        assert_eq!(percent_decode("G%C3%B6rsel.png"), "Görsel.png");
        assert_eq!(percent_decode("100%.png"), "100%.png");
        assert_eq!(percent_decode("%FF.png"), "%FF.png");
    }

    #[test]
    fn moving_a_note_relinks_its_files_and_nothing_else() {
        let body = "Intro ![a](attachments/a.png) and ![b](<attachments/b c.png> \"Title\")\n\n\
                    ![web](https://x.org/w.png) ![anchor](#x) [Report.pdf](attachments/Report.pdf)\n\n\
                    [![logo](attachments/logo.png)](https://x.org) [site](https://x.org) <https://x.org>\n\n\
                    ```\n![code](attachments/a.png)\n```\n\n![far](../outside.png) ![enc](attachments/d%20e.png)\n";
        let moved = relink_files(body, "", "Work/Projects").unwrap();
        assert_eq!(
            moved,
            "Intro ![a](../../attachments/a.png) and ![b](<../../attachments/b c.png> \"Title\")\n\n\
             ![web](https://x.org/w.png) ![anchor](#x) [Report.pdf](../../attachments/Report.pdf)\n\n\
             [![logo](../../attachments/logo.png)](https://x.org) [site](https://x.org) <https://x.org>\n\n\
             ```\n![code](attachments/a.png)\n```\n\n![far](../../../outside.png) ![enc](../../attachments/d%20e.png)\n"
        );
        assert_eq!(relink_files(&moved, "Work/Projects", "").unwrap(), body);
        assert_eq!(relink_files(body, "Work", "Work"), None);
        assert_eq!(relink_files("No links here.\n", "", "Work"), None);
    }

    #[test]
    fn tricky_destinations_are_found_or_left_alone() {
        let body = "![a [nested] alt](a\\(1\\).png) ![](b.png) ![ref][r]\n\n[r]: c.png\n";
        let moved = relink_files(body, "", "W").unwrap();
        assert_eq!(moved, "![a [nested] alt](../a\\(1\\).png) ![](../b.png) ![ref][r]\n\n[r]: c.png\n");
    }
}

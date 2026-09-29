//! Turning user-provided titles and folder names into safe file names.
//!
//! Names are kept readable (Unicode is preserved) while removing characters
//! that are invalid or troublesome on Linux and on filesystems notes are
//! commonly synced to (FAT/NTFS via Syncthing, Nextcloud, USB drives).

use crate::error::{AppError, AppResult};

/// Maximum length of a file stem in bytes (ext4 allows 255 for the full name).
pub const MAX_STEM_BYTES: usize = 150;
pub const UNTITLED: &str = "Untitled";

const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
    "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn clean(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_space = false;
    for ch in name.chars() {
        let mapped = match ch {
            '/' | '\\' | ':' => Some('-'),
            '*' | '?' | '"' | '<' | '>' | '|' => None,
            c if c.is_control() || c.is_whitespace() => Some(' '),
            c => Some(c),
        };
        if let Some(c) = mapped {
            if c == ' ' {
                if !last_space {
                    out.push(' ');
                }
                last_space = true;
            } else {
                out.push(c);
                last_space = false;
            }
        }
    }
    // Leading dots would hide the file; trailing dots/spaces break other OSes.
    let trimmed = out.trim().trim_start_matches('.').trim_end_matches(['.', ' ']).trim();
    let mut result = truncate_bytes(trimmed, MAX_STEM_BYTES).trim_end_matches(['.', ' ']).to_string();
    if WINDOWS_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(&result)) {
        result.push('_');
    }
    result
}

fn truncate_bytes(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// File stem for a note title. Never empty.
pub fn note_file_stem(title: &str) -> String {
    let cleaned = clean(title);
    if cleaned.is_empty() { UNTITLED.to_string() } else { cleaned }
}

/// Validated folder name. Errors instead of inventing a name.
pub fn folder_name(name: &str) -> AppResult<String> {
    let cleaned = clean(name);
    if cleaned.is_empty() {
        return Err(AppError::invalid("Folder name cannot be empty"));
    }
    Ok(cleaned)
}

/// `stem.md`, `stem 2.md`, `stem 3.md`… — the first name `exists` rejects.
pub fn unique_file_name(stem: &str, extension: &str, exists: impl Fn(&str) -> bool) -> String {
    let first = format!("{stem}.{extension}");
    if !exists(&first) {
        return first;
    }
    (2..)
        .map(|n| format!("{stem} {n}.{extension}"))
        .find(|candidate| !exists(candidate))
        .expect("unbounded iterator always finds a free name")
}

pub fn unique_dir_name(name: &str, exists: impl Fn(&str) -> bool) -> String {
    if !exists(name) {
        return name.to_string();
    }
    (2..)
        .map(|n| format!("{name} {n}"))
        .find(|candidate| !exists(candidate))
        .expect("unbounded iterator always finds a free name")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_unicode_and_spaces() {
        assert_eq!(note_file_stem("Günlük notlar — ışık"), "Günlük notlar — ışık");
        assert_eq!(note_file_stem("  Many   spaces\there "), "Many spaces here");
    }

    #[test]
    fn strips_path_separators_and_reserved_characters() {
        assert_eq!(note_file_stem("a/b\\c:d"), "a-b-c-d");
        assert_eq!(note_file_stem("What? *Really* <yes>|"), "What Really yes");
        assert_eq!(note_file_stem("../../etc/passwd"), "-..-etc-passwd");
        assert_eq!(note_file_stem("line\nbreak\0null"), "line break null");
    }

    #[test]
    fn never_hidden_or_empty() {
        assert_eq!(note_file_stem(".hidden"), "hidden");
        assert_eq!(note_file_stem("..."), UNTITLED);
        assert_eq!(note_file_stem("   "), UNTITLED);
        assert_eq!(note_file_stem("trailing dots..."), "trailing dots");
        assert!(folder_name("  ").is_err());
        assert!(folder_name("..").is_err());
    }

    #[test]
    fn avoids_windows_reserved_names() {
        assert_eq!(note_file_stem("con"), "con_");
        assert_eq!(note_file_stem("LPT1"), "LPT1_");
    }

    #[test]
    fn truncates_on_char_boundary() {
        let long = "ğ".repeat(200);
        let stem = note_file_stem(&long);
        assert!(stem.len() <= MAX_STEM_BYTES);
        assert!(stem.chars().all(|c| c == 'ğ'));
    }

    #[test]
    fn unique_names_are_numbered() {
        let taken = ["Note.md", "Note 2.md"];
        assert_eq!(unique_file_name("Note", "md", |n| taken.contains(&n)), "Note 3.md");
        assert_eq!(unique_file_name("Other", "md", |n| taken.contains(&n)), "Other.md");
        assert_eq!(unique_dir_name("Work", |n| n == "Work"), "Work 2");
    }
}

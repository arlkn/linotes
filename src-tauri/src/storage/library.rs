use super::markdown;
use super::note_file::{
    KEY_CREATED, KEY_FAVORITE, KEY_ID, KEY_TITLE, KEY_TRASHED_AT, KEY_TRASHED_FROM, KEY_UPDATED, NoteFile, Scalar,
    format_utc, normalize_body, now_utc,
};
use super::{MAX_NOTE_BYTES, MAX_TITLE_CHARS, Note, SaveNoteInput, SavedNote};
use crate::database::repo::{self, FileStamp, NoteRow, NoteSummary};
use crate::database::{Database, OpenOutcome};
use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::atomic::{rename_no_clobber, write_atomic, write_new_atomic};
use crate::filesystem::recovery::{RecoveredFile, recover_interrupted_writes};
use crate::filesystem::safe_path::{self, join_rel, name_of, parent_of};
use crate::filesystem::sanitize::{note_file_stem, unique_file_name};
use crate::filesystem::{TRASH_DIR, mtime_ns, sha256_hex};
use crate::search::{self, SearchHit, SearchQuery};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub struct Library {
    pub(crate) root: PathBuf,
    pub(crate) db: Database,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenReport {
    pub recovered: Vec<RecoveredFile>,
    /// Path of a corrupt index that was moved aside and rebuilt.
    pub replaced_corrupt_index: Option<String>,
    pub sync: super::SyncReport,
}

impl Library {
    /// Open (and if needed create) the library at `root`.
    pub fn open(
        root: &Path,
        create_if_missing: bool,
        index_dir: &Path,
        recovery_dir: &Path,
    ) -> AppResult<(Self, OpenReport)> {
        let root = prepare_root(root, create_if_missing)?;
        let recovered = recover_interrupted_writes(&root, recovery_dir)?;
        let key = sha256_hex(root.to_string_lossy().as_bytes());
        let db_path = index_dir.join(format!("{}.sqlite", &key[..16]));
        let (db, outcome) = Database::open(&db_path)?;
        repo::set_meta(&db.conn, "library_root", &root.to_string_lossy())?;
        Self::finish_open(root, db, outcome, recovered)
    }

    /// A library whose index lives in memory (tests).
    #[cfg(test)]
    pub fn open_with_memory_index(root: &Path) -> AppResult<(Self, OpenReport)> {
        let root = prepare_root(root, true)?;
        let db = Database::open_in_memory()?;
        let outcome = OpenOutcome { replaced_corrupt: None, needs_full_reindex: true };
        Self::finish_open(root, db, outcome, Vec::new())
    }

    fn finish_open(
        root: PathBuf,
        db: Database,
        outcome: OpenOutcome,
        recovered: Vec<RecoveredFile>,
    ) -> AppResult<(Self, OpenReport)> {
        let mut library = Library { root, db };
        let sync = library.sync_all(outcome.needs_full_reindex)?;
        if outcome.needs_full_reindex {
            library.db.clear_full_reindex_flag()?;
        }
        let report = OpenReport {
            recovered,
            replaced_corrupt_index: outcome.replaced_corrupt.map(|p| p.display().to_string()),
            sync,
        };
        Ok((library, report))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    // ----- Reading ---------------------------------------------------------

    pub fn list_notes(&self) -> AppResult<Vec<NoteSummary>> {
        repo::list_summaries(&self.db.conn)
    }

    pub fn search(&self, query: &SearchQuery) -> AppResult<Vec<SearchHit>> {
        search::search(&self.db.conn, query)
    }

    /// Load a note fresh from disk, re-indexing it if it changed externally.
    pub fn read_note(&mut self, id: &str) -> AppResult<Note> {
        let row = self.row(id)?;
        let path = self.abs(&row.rel_path);
        let file = match read_note_file(&path) {
            Ok(file) => file,
            Err(AppError::Io { .. }) if !path.exists() => {
                return Err(AppError::FileMissing(format!(
                    "The file for “{}” was moved or deleted outside Linotes.",
                    display_title(&row.summary.title)
                )));
            }
            Err(err) => return Err(err),
        };
        let rev = sha256_hex(file.body.as_bytes());
        let stamp = stamp(&path)?;
        let summary = if rev != row.body_hash || stamp.mtime_ns != row.file_mtime_ns || stamp.size != row.file_size {
            self.index_file(&row.rel_path, &file, row.summary.id.clone(), row.id_in_file, stamp, Some(&row))?.summary
        } else {
            row.summary
        };
        Ok(Note { summary, content: file.body, rev, path: path.display().to_string() })
    }

    // ----- Creating and saving --------------------------------------------

    pub fn create_note(&mut self, folder: &str, title: &str, body: &str) -> AppResult<Note> {
        let dir = safe_path::resolve_existing_dir(&self.root, folder)?;
        let title = clean_title(title)?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_utc();
        let mut file = NoteFile::new(&normalize_body(body));
        file.set(KEY_ID, Some(Scalar::str(&id)));
        file.set(KEY_TITLE, Some(Scalar::str(&title)));
        file.set(KEY_CREATED, Some(Scalar::str(&now)));
        file.set(KEY_UPDATED, Some(Scalar::str(&now)));
        let bytes = file.serialize();
        let stem = note_file_stem(&title);

        let mut attempts = 0;
        let name = loop {
            let taken = lowercase_names(&dir);
            let name = unique_file_name(&stem, "md", |n| taken.contains(&n.to_lowercase()));
            match write_new_atomic(&dir.join(&name), bytes.as_bytes()) {
                Ok(()) => break name,
                Err(AppError::AlreadyExists(_)) if attempts < 5 => attempts += 1,
                Err(err) => return Err(err),
            }
        };
        let rel = join_rel(folder, &name);
        let path = self.abs(&rel);
        let row = self.index_file(&rel, &file, id, true, stamp(&path)?, None)?;
        Ok(Note { summary: row.summary, content: file.body, rev: row.body_hash, path: path.display().to_string() })
    }

    pub fn save_note(&mut self, input: SaveNoteInput) -> AppResult<SavedNote> {
        if input.content.len() > MAX_NOTE_BYTES {
            return Err(AppError::invalid("This note is too large to save (limit: 20 MB)."));
        }
        let row = self.row(&input.id)?;
        if row.summary.trashed {
            return Err(AppError::invalid("Notes in the trash can’t be edited. Restore the note first."));
        }
        let title = clean_title(&input.title)?;
        let path = self.abs(&row.rel_path);

        let mut file = match read_note_file(&path) {
            Ok(file) => file,
            Err(_) if !path.exists() => {
                if !input.force {
                    return Err(AppError::FileMissing(format!(
                        "The file for “{}” was moved or deleted outside Linotes.",
                        display_title(&row.summary.title)
                    )));
                }
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).with_path("create", parent)?;
                }
                NoteFile::new("")
            }
            Err(err) => return Err(err),
        };

        let disk_rev = sha256_hex(file.body.as_bytes());
        if !input.force && disk_rev != input.expected_rev {
            return Err(AppError::Conflict(format!(
                "“{}” was changed outside Linotes since you opened it.",
                display_title(&row.summary.title)
            )));
        }

        let meta = file.meta();
        file.body = normalize_body(&input.content);
        file.set(KEY_ID, Some(Scalar::str(&row.summary.id)));
        file.set(KEY_TITLE, Some(Scalar::str(&title)));
        if meta.created.is_none() {
            file.set(KEY_CREATED, Some(Scalar::str(&row.summary.created_at)));
        }
        file.set(KEY_UPDATED, Some(Scalar::str(now_utc())));
        write_atomic(&path, file.serialize().as_bytes())?;

        let mut rel = row.rel_path.clone();
        if title != row.summary.title {
            rel = self.rename_for_title(&rel, &title)?;
        }
        let path = self.abs(&rel);
        let saved = self.index_file(&rel, &file, row.summary.id.clone(), true, stamp(&path)?, Some(&row))?;
        Ok(SavedNote { summary: saved.summary, rev: saved.body_hash, path: path.display().to_string() })
    }

    /// Rename a note file to match its title. Keeps the old name on failure.
    fn rename_for_title(&mut self, rel: &str, title: &str) -> AppResult<String> {
        let current_name = name_of(rel).to_string();
        let (current_stem, ext) = split_ext(&current_name);
        let desired_stem = note_file_stem(title);
        if desired_stem == current_stem {
            return Ok(rel.to_string());
        }
        let folder = parent_of(rel).to_string();
        let dir = self.abs(&folder);
        let taken = lowercase_names(&dir);
        let current_lower = current_name.to_lowercase();
        let new_name = unique_file_name(&desired_stem, ext, |n| {
            n.to_lowercase() != current_lower && taken.contains(&n.to_lowercase())
        });
        if new_name == current_name {
            return Ok(rel.to_string());
        }
        match rename_no_clobber(&dir.join(&current_name), &dir.join(&new_name)) {
            Ok(()) => Ok(join_rel(&folder, &new_name)),
            Err(err) => {
                log::warn!("Could not rename {current_name} to {new_name}: {err}");
                Ok(rel.to_string())
            }
        }
    }

    // ----- Metadata and organisation ---------------------------------------

    pub fn set_favorite(&mut self, id: &str, favorite: bool) -> AppResult<NoteSummary> {
        let row = self.row(id)?;
        self.rewrite_frontmatter(&row, |file| {
            file.set(KEY_ID, Some(Scalar::str(&row.summary.id)));
            file.set(KEY_FAVORITE, favorite.then_some(Scalar::Bool(true)));
        })
    }

    pub fn move_note(&mut self, id: &str, folder: &str) -> AppResult<NoteSummary> {
        let row = self.row(id)?;
        if row.summary.trashed {
            return Err(AppError::invalid("Restore the note from the trash before moving it."));
        }
        let target_dir = safe_path::resolve_existing_dir(&self.root, folder)?;
        if parent_of(&row.rel_path) == folder {
            return Ok(row.summary);
        }
        let rel = self.move_file_into(&row.rel_path, &target_dir, folder)?;
        self.reindex_existing(&rel, &row)
    }

    pub fn trash_note(&mut self, id: &str) -> AppResult<NoteSummary> {
        let row = self.row(id)?;
        if row.summary.trashed {
            return Ok(row.summary);
        }
        let from = parent_of(&row.rel_path).to_string();
        let now = now_utc();
        self.rewrite_frontmatter(&row, |file| {
            file.set(KEY_ID, Some(Scalar::str(&row.summary.id)));
            file.set(KEY_TRASHED_FROM, (!from.is_empty()).then(|| Scalar::str(&from)));
            file.set(KEY_TRASHED_AT, Some(Scalar::str(&now)));
        })?;
        let row = self.row(id)?;
        let trash = self.root.join(TRASH_DIR);
        fs::create_dir_all(&trash).with_path("create", &trash)?;
        let rel = self.move_file_into(&row.rel_path, &trash, TRASH_DIR)?;
        self.reindex_existing(&rel, &row)
    }

    pub fn restore_note(&mut self, id: &str) -> AppResult<NoteSummary> {
        let row = self.row(id)?;
        if !row.summary.trashed {
            return Ok(row.summary);
        }
        let folder =
            row.trashed_from.clone().filter(|f| safe_path::validate_folder_path(f).is_ok()).unwrap_or_default();
        let target = safe_path::resolve(&self.root, &folder)?;
        if !target.is_dir() {
            fs::create_dir_all(&target).with_path("recreate folder", &target)?;
        }
        safe_path::ensure_inside(&self.root, &target)?;
        self.rewrite_frontmatter(&row, |file| {
            file.set(KEY_TRASHED_FROM, None);
            file.set(KEY_TRASHED_AT, None);
        })?;
        let row = self.row(id)?;
        let rel = self.move_file_into(&row.rel_path, &target, &folder)?;
        self.reindex_existing(&rel, &row)
    }

    pub fn delete_note_permanently(&mut self, id: &str) -> AppResult<()> {
        let row = self.row(id)?;
        if !row.summary.trashed {
            return Err(AppError::invalid("Only notes in the trash can be deleted permanently."));
        }
        let path = self.abs(&row.rel_path);
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(err) if err.kind() == io::ErrorKind::NotFound => {}
            Err(err) => return Err(err).with_path("delete", &path),
        }
        repo::delete(&self.db.conn, id)?;
        Ok(())
    }

    pub fn empty_trash(&mut self) -> AppResult<u32> {
        let ids: Vec<String> =
            repo::list(&self.db.conn)?.into_iter().filter(|r| r.summary.trashed).map(|r| r.summary.id).collect();
        let mut deleted = 0;
        for id in ids {
            self.delete_note_permanently(&id)?;
            deleted += 1;
        }
        Ok(deleted)
    }

    // ----- Helpers ---------------------------------------------------------

    pub(crate) fn contains_id(&self, id: &str) -> AppResult<bool> {
        Ok(repo::get(&self.db.conn, id)?.is_some())
    }

    pub(crate) fn row(&self, id: &str) -> AppResult<NoteRow> {
        repo::get(&self.db.conn, id)?.ok_or_else(|| AppError::not_found("That note no longer exists."))
    }

    pub(crate) fn abs(&self, rel: &str) -> PathBuf {
        if rel.is_empty() { self.root.clone() } else { self.root.join(rel) }
    }

    /// Read a note file, apply `edit` to its frontmatter, write it back.
    /// The body is left untouched, so the editor's revision stays valid.
    fn rewrite_frontmatter(&mut self, row: &NoteRow, edit: impl FnOnce(&mut NoteFile)) -> AppResult<NoteSummary> {
        let path = self.abs(&row.rel_path);
        let mut file = read_note_file(&path)?;
        edit(&mut file);
        write_atomic(&path, file.serialize().as_bytes())?;
        let saved = self.index_file(&row.rel_path, &file, row.summary.id.clone(), true, stamp(&path)?, Some(row))?;
        Ok(saved.summary)
    }

    /// Move a note file into `target_dir` (library-relative `target_rel`), keeping its name if free.
    fn move_file_into(&self, rel: &str, target_dir: &Path, target_rel: &str) -> AppResult<String> {
        let name = name_of(rel);
        let (stem, ext) = split_ext(name);
        let mut attempts = 0;
        loop {
            let taken = lowercase_names(target_dir);
            let new_name = unique_file_name(stem, ext, |n| taken.contains(&n.to_lowercase()));
            match rename_no_clobber(&self.abs(rel), &target_dir.join(&new_name)) {
                Ok(()) => return Ok(join_rel(target_rel, &new_name)),
                Err(AppError::AlreadyExists(_)) if attempts < 5 => attempts += 1,
                Err(err) => return Err(err),
            }
        }
    }

    fn reindex_existing(&mut self, rel: &str, previous: &NoteRow) -> AppResult<NoteSummary> {
        let path = self.abs(rel);
        let file = read_note_file(&path)?;
        let row = self.index_file(
            rel,
            &file,
            previous.summary.id.clone(),
            previous.id_in_file,
            stamp(&path)?,
            Some(previous),
        )?;
        Ok(row.summary)
    }

    /// Build an index row for a file and store it.
    pub(super) fn index_file(
        &mut self,
        rel: &str,
        file: &NoteFile,
        id: String,
        id_in_file: bool,
        stamp: FileStamp,
        previous: Option<&NoteRow>,
    ) -> AppResult<NoteRow> {
        let (row, body_text) = build_row(rel, file, id, id_in_file, stamp, previous);
        repo::upsert(&self.db.conn, &row, &body_text)?;
        Ok(row)
    }
}

pub(super) fn build_row(
    rel: &str,
    file: &NoteFile,
    id: String,
    id_in_file: bool,
    stamp: FileStamp,
    previous: Option<&NoteRow>,
) -> (NoteRow, String) {
    let meta = file.meta();
    let trashed = rel.starts_with(&format!("{TRASH_DIR}/"));
    let (stem, _) = split_ext(name_of(rel));
    let title = meta.title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).unwrap_or_else(|| stem.to_string());
    let body_text = markdown::plain_text(&file.body);
    let preview = markdown::preview(&body_text, &title);
    let body_hash = sha256_hex(file.body.as_bytes());
    let file_time = format_utc(DateTime::<Utc>::from_timestamp_nanos(stamp.mtime_ns));
    let same_note = previous.filter(|p| p.summary.id == id);

    let created =
        meta.created.or_else(|| same_note.map(|p| p.summary.created_at.clone())).unwrap_or_else(|| file_time.clone());
    let recorded = meta.updated.clone().unwrap_or_else(|| file_time.clone());
    let updated = match same_note {
        // Edited outside Linotes: the file's mtime is the best evidence.
        Some(p) if p.body_hash != body_hash => recorded.max(file_time.clone()),
        _ => recorded,
    };
    let trashed_from = if trashed {
        meta.trashed_from
            .or_else(|| same_note.and_then(|p| p.trashed_from.clone()))
            .filter(|f| safe_path::validate_folder_path(f).is_ok())
    } else {
        None
    };
    let folder = if trashed { trashed_from.clone().unwrap_or_default() } else { parent_of(rel).to_string() };

    let row = NoteRow {
        summary: NoteSummary {
            id,
            title,
            preview,
            folder,
            favorite: meta.favorite,
            trashed,
            trashed_at: if trashed { meta.trashed_at.or_else(|| Some(file_time.clone())) } else { None },
            created_at: created,
            updated_at: updated,
        },
        rel_path: rel.to_string(),
        trashed_from,
        body_hash,
        file_mtime_ns: stamp.mtime_ns,
        file_size: stamp.size,
        id_in_file,
    };
    (row, body_text)
}

fn prepare_root(root: &Path, create_if_missing: bool) -> AppResult<PathBuf> {
    if !root.exists() {
        if !create_if_missing {
            return Err(AppError::Unavailable(format!(
                "The notes folder “{}” is not available. It may be on a drive that is not connected.",
                root.display()
            )));
        }
        fs::create_dir_all(root).with_path("create the notes folder", root)?;
    }
    let root = root.canonicalize().with_path("open the notes folder", root)?;
    if !root.is_dir() {
        return Err(AppError::invalid(format!("“{}” is not a folder.", root.display())));
    }
    Ok(root)
}

pub(super) fn read_note_file(path: &Path) -> AppResult<NoteFile> {
    let bytes = fs::read(path).with_path("read", path)?;
    if bytes.len() > MAX_NOTE_BYTES {
        return Err(AppError::invalid(format!("“{}” is larger than 20 MB.", path.display())));
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| AppError::invalid(format!("“{}” is not valid UTF-8 text.", path.display())))?;
    Ok(NoteFile::parse(&text))
}

pub(super) fn stamp(path: &Path) -> AppResult<FileStamp> {
    let meta = fs::symlink_metadata(path).with_path("inspect", path)?;
    Ok(FileStamp { mtime_ns: mtime_ns(&meta), size: meta.len() as i64 })
}

pub(crate) fn lowercase_names(dir: &Path) -> HashSet<String> {
    fs::read_dir(dir)
        .map(|entries| entries.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_lowercase()).collect())
        .unwrap_or_default()
}

pub(super) fn split_ext(name: &str) -> (&str, &str) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, ext),
        _ => (name, "md"),
    }
}

fn clean_title(title: &str) -> AppResult<String> {
    let title: String = title.chars().filter(|c| !c.is_control()).collect::<String>().trim().to_string();
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::invalid("Titles are limited to 500 characters."));
    }
    Ok(title)
}

fn display_title(title: &str) -> &str {
    if title.is_empty() { "Untitled" } else { title }
}

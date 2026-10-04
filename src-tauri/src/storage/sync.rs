//! Reconciling the index with the files on disk.
//!
//! Runs at startup and whenever the file watcher reports changes. Files are
//! re-read only when their size or modification time changed, so a sync over
//! an unchanged library costs one `stat` per note.
//!
//! Note identity: a note keeps the `id` from its frontmatter. Files without
//! one keep the id they were indexed with (so moves inside Linotes preserve
//! identity), or get a deterministic id derived from their path. If two files
//! claim the same id (e.g. a note copied in a file manager), the file that was
//! already indexed keeps it and the other gets a new id.

use super::Library;
use super::library::{build_row, read_note_file, stamp};
use super::note_file::NoteFile;
use crate::database::repo::{self, FileStamp, NoteRow};
use crate::error::AppResult;
use crate::filesystem::atomic::is_temp_file;
use crate::filesystem::safe_path::{self, MAX_FOLDER_DEPTH};
use crate::filesystem::{TRASH_DIR, is_note_file_name};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use walkdir::WalkDir;

/// Namespace for ids derived from file paths (UUID v5).
const PATH_ID_NAMESPACE: uuid::Uuid = uuid::Uuid::from_u128(0x3b0e5e59_5f0e_4c0f_9a53_6c696e6f7465);

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub added: Vec<String>,
    pub updated: Vec<String>,
    pub removed: Vec<String>,
    /// Files that look like notes but could not be indexed.
    pub skipped: Vec<SkippedFile>,
}

impl SyncReport {
    pub fn has_changes(&self) -> bool {
        !(self.added.is_empty() && self.updated.is_empty() && self.removed.is_empty())
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

struct DiskFile {
    rel: String,
    stamp: FileStamp,
}

impl Library {
    /// Bring the index in line with the notes folder. With `force`, every file is re-read.
    pub fn sync_all(&mut self, force: bool) -> AppResult<SyncReport> {
        let known = repo::path_index(&self.db.conn)?;
        let known_ids: HashSet<String> = known.values().map(|(id, _)| id.clone()).collect();
        let (disk, mut skipped) = self.scan();

        let mut claimed: HashSet<String> = HashSet::new();
        let mut changed: Vec<&DiskFile> = Vec::new();
        for file in &disk {
            match known.get(&file.rel) {
                Some((id, stamp)) if !force && *stamp == file.stamp => {
                    claimed.insert(id.clone());
                }
                _ => changed.push(file),
            }
        }

        // Parse changed files and settle their ids.
        let mut parsed: Vec<(&DiskFile, NoteFile, String, bool)> = Vec::new();
        for file in changed {
            let path = self.abs(&file.rel);
            let text = match fs::read(&path).map(String::from_utf8) {
                Ok(Ok(text)) => text,
                Ok(Err(_)) => {
                    skipped.push(SkippedFile { path: file.rel.clone(), reason: "Not valid UTF-8 text".into() });
                    continue;
                }
                Err(err) => {
                    skipped.push(SkippedFile { path: file.rel.clone(), reason: format!("Could not read: {err}") });
                    continue;
                }
            };
            if text.len() > super::MAX_NOTE_BYTES {
                skipped.push(SkippedFile { path: file.rel.clone(), reason: "Larger than 20 MB".into() });
                continue;
            }
            let note = NoteFile::parse(&text);
            let from_file = note.meta().id.filter(|id| !claimed.contains(id));
            let (id, in_file) = match from_file {
                Some(id) => (id, true),
                None => {
                    let previous = known.get(&file.rel).map(|(id, _)| id.clone()).filter(|id| !claimed.contains(id));
                    let id = previous.unwrap_or_else(|| {
                        let derived = uuid::Uuid::new_v5(&PATH_ID_NAMESPACE, file.rel.as_bytes()).to_string();
                        if claimed.contains(&derived) { uuid::Uuid::new_v4().to_string() } else { derived }
                    });
                    (id, false)
                }
            };
            claimed.insert(id.clone());
            parsed.push((file, note, id, in_file));
        }

        // The rows being replaced, read before any are dropped (a moved note keeps its dates).
        let mut previous_rows: HashMap<&str, NoteRow> = HashMap::new();
        for (_, _, id, _) in &parsed {
            if let Some(row) = repo::get(&self.db.conn, id)? {
                previous_rows.insert(id, row);
            }
        }
        let mut report = SyncReport { skipped, ..Default::default() };
        let disk_paths: HashSet<&str> = disk.iter().map(|f| f.rel.as_str()).collect();
        let skipped_paths: HashSet<&str> = report.skipped.iter().map(|s| s.path.as_str()).collect();
        let new_ids: HashMap<&str, &str> = parsed.iter().map(|(f, _, id, _)| (f.rel.as_str(), id.as_str())).collect();

        let tx = self.db.conn.unchecked_transaction()?;
        // Drop rows whose file is gone, unreadable, or about to be re-indexed under another id.
        for (rel, (id, _)) in &known {
            let gone = !disk_paths.contains(rel.as_str());
            let unreadable = skipped_paths.contains(rel.as_str());
            let reassigned = new_ids.get(rel.as_str()).is_some_and(|new_id| new_id != id);
            if gone || unreadable || reassigned {
                repo::delete(&tx, id)?;
            }
        }
        for (file, note, id, in_file) in &parsed {
            let previous = previous_rows.get(id.as_str());
            let (row, body_text) = build_row(&file.rel, note, id.clone(), *in_file, file.stamp, previous);
            // Another row may still hold this path under a different id; the path is authoritative.
            if let Some(existing) = repo::get_by_path(&tx, &file.rel)?
                && existing.summary.id != *id
            {
                repo::delete(&tx, &existing.summary.id)?;
            }
            repo::upsert(&tx, &row, &body_text)?;
            if known_ids.contains(id) {
                report.updated.push(id.clone());
            } else {
                report.added.push(id.clone());
            }
        }
        tx.commit()?;

        report.removed = known_ids.difference(&claimed).cloned().collect();
        report.removed.sort();
        report.added.sort();
        report.updated.sort();
        if report.has_changes() || !report.skipped.is_empty() {
            log::info!(
                "Index sync: {} added, {} updated, {} removed, {} skipped",
                report.added.len(),
                report.updated.len(),
                report.removed.len(),
                report.skipped.len()
            );
        }
        Ok(report)
    }

    /// Index a single file that was just written by Linotes (e.g. an import).
    pub(crate) fn index_new_path(&mut self, rel: &str) -> AppResult<NoteRow> {
        let path = self.abs(rel);
        let file = read_note_file(&path)?;
        let (id, in_file) = match file.meta().id {
            Some(id) if !self.contains_id(&id)? => (id, true),
            _ => {
                let derived = uuid::Uuid::new_v5(&PATH_ID_NAMESPACE, rel.as_bytes()).to_string();
                let id = if self.contains_id(&derived)? { uuid::Uuid::new_v4().to_string() } else { derived };
                (id, false)
            }
        };
        self.index_file(rel, &file, id, in_file, stamp(&path)?, None)
    }

    /// All note files under the root (including the trash), with their stamps.
    fn scan(&self) -> (Vec<DiskFile>, Vec<SkippedFile>) {
        let mut files = Vec::new();
        let mut skipped = Vec::new();
        let walker =
            WalkDir::new(&self.root).follow_links(false).max_depth(MAX_FOLDER_DEPTH + 1).into_iter().filter_entry(
                |e| {
                    let name = e.file_name().to_string_lossy();
                    e.depth() == 0
                        || !name.starts_with('.')
                        || (e.depth() == 1 && name == TRASH_DIR && e.file_type().is_dir())
                },
            );
        for entry in walker.filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy();
            if !is_note_file_name(&name) || is_temp_file(entry.path()) {
                continue;
            }
            let Some(rel) = safe_path::to_rel(&self.root, entry.path()) else {
                skipped.push(SkippedFile {
                    path: entry.path().display().to_string(),
                    reason: "File name is not valid UTF-8".into(),
                });
                continue;
            };
            // Only direct children of the trash are notes; nested content there is ignored.
            if rel.starts_with(&format!("{TRASH_DIR}/")) && rel.matches('/').count() > 1 {
                continue;
            }
            match stamp(entry.path()) {
                Ok(stamp) => files.push(DiskFile { rel, stamp }),
                Err(err) => skipped.push(SkippedFile { path: rel, reason: err.to_string() }),
            }
        }
        (files, skipped)
    }
}

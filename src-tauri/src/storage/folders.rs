//! Folders are plain directories inside the notes folder.

use super::Library;
use super::library::lowercase_names;
use crate::database::repo;
use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::ATTACHMENTS_DIR;
use crate::filesystem::atomic::is_temp_file;
use crate::filesystem::safe_path::{self, MAX_FOLDER_DEPTH, join_rel, name_of, parent_of};
use crate::filesystem::sanitize;
use serde::Serialize;
use std::fs;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    /// Library-relative path, e.g. `Work/Projects`.
    pub path: String,
    pub name: String,
    /// Parent folder path (`""` for top-level folders).
    pub parent: String,
    /// Notes directly inside this folder (not counting subfolders or trash).
    pub note_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderReport {
    /// Notes moved to the trash.
    pub trashed_notes: u32,
    /// Whether the folder itself was removed from disk.
    pub removed: bool,
    /// Non-note files that were left in place (the folder is kept in that case).
    pub remaining_files: Vec<String>,
}

impl Library {
    pub fn list_folders(&self) -> AppResult<Vec<FolderInfo>> {
        let counts = repo::folder_counts(&self.db.conn)?;
        // The images folder is not a folder of notes, unless someone keeps notes there.
        let attachments_prefix = format!("{ATTACHMENTS_DIR}/");
        let show_attachments = counts.iter().any(|(folder, &count)| {
            count > 0 && (folder == ATTACHMENTS_DIR || folder.starts_with(&attachments_prefix))
        });
        let mut folders = Vec::new();
        let walker = WalkDir::new(&self.root)
            .min_depth(1)
            .max_depth(MAX_FOLDER_DEPTH)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !name.starts_with('.') && (show_attachments || e.depth() > 1 || name != ATTACHMENTS_DIR)
            });
        for entry in walker.filter_map(|e| e.ok()) {
            if !entry.file_type().is_dir() {
                continue;
            }
            let Some(rel) = safe_path::to_rel(&self.root, entry.path()) else { continue };
            if safe_path::validate_folder_path(&rel).is_err() {
                continue;
            }
            folders.push(FolderInfo {
                name: name_of(&rel).to_string(),
                parent: parent_of(&rel).to_string(),
                note_count: counts.get(&rel).copied().unwrap_or(0),
                path: rel,
            });
        }
        folders.sort_by_key(|f| f.path.to_lowercase());
        Ok(folders)
    }

    pub fn create_folder(&mut self, parent: &str, name: &str) -> AppResult<FolderInfo> {
        let parent_dir = safe_path::resolve_existing_dir(&self.root, parent)?;
        let name = sanitize::folder_name(name)?;
        check_not_reserved(parent, &name)?;
        if lowercase_names(&parent_dir).contains(&name.to_lowercase()) {
            return Err(AppError::AlreadyExists(format!("A folder or file named “{name}” already exists here.")));
        }
        let path = parent_dir.join(&name);
        fs::create_dir(&path).with_path("create folder", &path)?;
        Ok(FolderInfo { path: join_rel(parent, &name), name, parent: parent.to_string(), note_count: 0 })
    }

    pub fn rename_folder(&mut self, path: &str, new_name: &str) -> AppResult<FolderInfo> {
        if path.is_empty() {
            return Err(AppError::invalid("The notes folder itself can’t be renamed here."));
        }
        let dir = safe_path::resolve_existing_dir(&self.root, path)?;
        let new_name = sanitize::folder_name(new_name)?;
        let parent = parent_of(path).to_string();
        check_not_reserved(&parent, &new_name)?;
        let new_rel = join_rel(&parent, &new_name);
        if new_rel != path {
            let case_only = new_rel.to_lowercase() == path.to_lowercase();
            if !case_only && lowercase_names(&self.abs(&parent)).contains(&new_name.to_lowercase()) {
                return Err(AppError::AlreadyExists(format!(
                    "A folder or file named “{new_name}” already exists here."
                )));
            }
            let target = self.abs(&new_rel);
            if !case_only && target.symlink_metadata().is_ok() {
                return Err(AppError::AlreadyExists(format!("“{new_name}” already exists.")));
            }
            fs::rename(&dir, &target).with_path("rename folder", &dir)?;
            let tx = self.db.conn.unchecked_transaction()?;
            repo::rename_folder_prefix(&tx, path, &new_rel)?;
            tx.commit()?;
        }
        let counts = repo::folder_counts(&self.db.conn)?;
        Ok(FolderInfo { note_count: counts.get(&new_rel).copied().unwrap_or(0), path: new_rel, name: new_name, parent })
    }

    /// Move every note in the folder (and subfolders) to the trash, then
    /// remove the directories if nothing else is left in them.
    pub fn delete_folder(&mut self, path: &str) -> AppResult<DeleteFolderReport> {
        if path.is_empty() {
            return Err(AppError::invalid("The notes folder itself can’t be deleted."));
        }
        let dir = safe_path::resolve_existing_dir(&self.root, path)?;
        let prefix = format!("{path}/");
        let ids: Vec<String> = repo::list(&self.db.conn)?
            .into_iter()
            .filter(|r| !r.summary.trashed && (r.summary.folder == path || r.summary.folder.starts_with(&prefix)))
            .map(|r| r.summary.id)
            .collect();
        let mut trashed_notes = 0;
        for id in &ids {
            self.trash_note(id)?;
            trashed_notes += 1;
        }

        // Remove now-empty directories bottom-up; clean up our own stale temp files.
        let mut remaining_files = Vec::new();
        for entry in WalkDir::new(&dir).follow_links(false).contents_first(true).into_iter().filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            if entry.file_type().is_dir() {
                let _ = fs::remove_dir(entry_path);
            } else if is_temp_file(entry_path) {
                let _ = fs::remove_file(entry_path);
            } else {
                remaining_files.push(
                    safe_path::to_rel(&self.root, entry_path).unwrap_or_else(|| entry_path.display().to_string()),
                );
            }
        }
        if !remaining_files.is_empty() {
            // Try again now that temp files are gone; directories may be empty after all.
            for entry in WalkDir::new(&dir).contents_first(true).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_dir() {
                    let _ = fs::remove_dir(entry.path());
                }
            }
        }
        remaining_files.sort();
        Ok(DeleteFolderReport { trashed_notes, removed: !dir.exists(), remaining_files })
    }
}

/// `attachments` at the top of the notes folder is where Linotes keeps images.
fn check_not_reserved(parent: &str, name: &str) -> AppResult<()> {
    if parent.is_empty() && name.eq_ignore_ascii_case(ATTACHMENTS_DIR) {
        return Err(AppError::invalid(format!(
            "“{ATTACHMENTS_DIR}” is where Linotes keeps the images in your notes. Choose another name."
        )));
    }
    Ok(())
}

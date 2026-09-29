//! Recovery of saves that were interrupted (crash, power loss, kill -9).
//!
//! An interrupted atomic write leaves a hidden `.<name>.linotes-tmp-*` file
//! next to its target. On startup each leftover is resolved:
//!
//! * empty, or identical to the target → removed (nothing to recover);
//! * target missing → the temp file becomes the target (an interrupted create);
//! * otherwise → moved to the recovery directory and reported to the user,
//!   because it may contain newer text than the target.
//!
//! Nothing is ever discarded if it could contain user text.

use crate::error::{AppResult, IoContext};
use crate::filesystem::atomic::{is_temp_file, temp_target};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredFile {
    /// The note the interrupted save belonged to.
    pub original: String,
    /// Where the recovered text was placed.
    pub saved_to: String,
    /// `restored`: became the note file again; `preserved`: copied aside for review.
    pub action: RecoveryAction,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryAction {
    Restored,
    Preserved,
}

pub fn recover_interrupted_writes(root: &Path, recovery_dir: &Path) -> AppResult<Vec<RecoveredFile>> {
    let mut recovered = Vec::new();
    let temps: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .max_depth(24)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file() && is_temp_file(entry.path()))
        .map(|entry| entry.into_path())
        .collect();

    for tmp in temps {
        let Some(target) = temp_target(&tmp) else { continue };
        let data = match fs::read(&tmp) {
            Ok(data) => data,
            Err(err) => {
                log::warn!("Could not read leftover temp file {}: {err}", tmp.display());
                continue;
            }
        };
        if data.is_empty() {
            let _ = fs::remove_file(&tmp);
            continue;
        }
        match fs::read(&target) {
            Ok(existing) if existing == data => {
                let _ = fs::remove_file(&tmp);
            }
            Ok(_) => {
                fs::create_dir_all(recovery_dir).with_path("create", recovery_dir)?;
                let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
                let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                let mut dest = recovery_dir.join(format!("{stamp} {name}"));
                let mut n = 2;
                while dest.exists() {
                    dest = recovery_dir.join(format!("{stamp} {n} {name}"));
                    n += 1;
                }
                // Copy then delete: works across filesystems.
                fs::write(&dest, &data).with_path("write", &dest)?;
                let _ = fs::remove_file(&tmp);
                recovered.push(RecoveredFile {
                    original: target.display().to_string(),
                    saved_to: dest.display().to_string(),
                    action: RecoveryAction::Preserved,
                });
            }
            Err(_) => {
                fs::rename(&tmp, &target).with_path("restore", &target)?;
                recovered.push(RecoveredFile {
                    original: target.display().to_string(),
                    saved_to: target.display().to_string(),
                    action: RecoveryAction::Restored,
                });
            }
        }
    }
    Ok(recovered)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_for(dir: &Path, name: &str) -> PathBuf {
        dir.join(format!(".{name}{}-abc123", crate::filesystem::atomic::TEMP_MARKER))
    }

    #[test]
    fn restores_interrupted_create() {
        let root = tempfile::tempdir().unwrap();
        let recovery = tempfile::tempdir().unwrap();
        fs::write(temp_for(root.path(), "New.md"), "draft").unwrap();
        let report = recover_interrupted_writes(root.path(), recovery.path()).unwrap();
        assert_eq!(report.len(), 1);
        assert_eq!(report[0].action, RecoveryAction::Restored);
        assert_eq!(fs::read_to_string(root.path().join("New.md")).unwrap(), "draft");
    }

    #[test]
    fn preserves_divergent_temp_file() {
        let root = tempfile::tempdir().unwrap();
        let recovery = tempfile::tempdir().unwrap();
        fs::write(root.path().join("Note.md"), "old").unwrap();
        fs::write(temp_for(root.path(), "Note.md"), "newer text").unwrap();
        let report = recover_interrupted_writes(root.path(), recovery.path()).unwrap();
        assert_eq!(report.len(), 1);
        assert_eq!(report[0].action, RecoveryAction::Preserved);
        assert_eq!(fs::read_to_string(root.path().join("Note.md")).unwrap(), "old");
        assert_eq!(fs::read_to_string(&report[0].saved_to).unwrap(), "newer text");
        assert!(!temp_for(root.path(), "Note.md").exists());
    }

    #[test]
    fn discards_identical_and_empty_temp_files() {
        let root = tempfile::tempdir().unwrap();
        let recovery = tempfile::tempdir().unwrap();
        fs::write(root.path().join("Same.md"), "same").unwrap();
        fs::write(temp_for(root.path(), "Same.md"), "same").unwrap();
        fs::write(temp_for(root.path(), "Empty.md"), "").unwrap();
        let report = recover_interrupted_writes(root.path(), recovery.path()).unwrap();
        assert!(report.is_empty());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }
}

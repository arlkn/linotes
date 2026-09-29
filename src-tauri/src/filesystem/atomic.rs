//! Crash-safe file writes.
//!
//! Content is written to a hidden temporary file in the same directory,
//! flushed to disk, and then renamed over the target. A crash therefore
//! leaves either the old file or the new file, never a truncated mix.
//! Leftover temporary files are handled by [`crate::filesystem::recovery`].

use crate::error::{AppError, AppResult, IoContext};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Marker embedded in temporary file names: `.<name><marker>-<random>`.
pub const TEMP_MARKER: &str = ".linotes-tmp";

pub fn is_temp_file(path: &Path) -> bool {
    path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with('.') && n.contains(TEMP_MARKER))
}

/// The file a temporary file was going to replace, if the name is ours.
pub fn temp_target(path: &Path) -> Option<PathBuf> {
    let name = path.file_name()?.to_str()?;
    let stripped = name.strip_prefix('.')?;
    let idx = stripped.rfind(TEMP_MARKER)?;
    let original = &stripped[..idx];
    if original.is_empty() {
        return None;
    }
    Some(path.with_file_name(original))
}

fn temp_path_for(target: &Path) -> AppResult<PathBuf> {
    let name = target.file_name().and_then(|n| n.to_str()).ok_or_else(|| AppError::invalid("Invalid file name"))?;
    let token = uuid::Uuid::new_v4().simple().to_string();
    Ok(target.with_file_name(format!(".{name}{TEMP_MARKER}-{}", &token[..10])))
}

fn write_temp(target: &Path, bytes: &[u8]) -> AppResult<PathBuf> {
    let tmp = temp_path_for(target)?;
    let result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    if let Err(err) = result {
        let _ = fs::remove_file(&tmp);
        return Err(err).with_path("write", target);
    }
    Ok(tmp)
}

fn sync_parent(path: &Path) {
    if let Some(parent) = path.parent()
        && let Ok(dir) = File::open(parent)
    {
        let _ = dir.sync_all();
    }
}

/// Atomically replace (or create) `target` with `bytes`.
pub fn write_atomic(target: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = write_temp(target, bytes)?;
    if let Ok(meta) = fs::metadata(target) {
        let _ = fs::set_permissions(&tmp, meta.permissions());
    }
    if let Err(err) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(err).with_path("save", target);
    }
    sync_parent(target);
    Ok(())
}

/// Atomically create `target`, failing with `AlreadyExists` instead of
/// replacing a file that appeared in the meantime.
pub fn write_new_atomic(target: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = write_temp(target, bytes)?;
    let result = link_no_clobber(&tmp, target);
    let _ = fs::remove_file(&tmp);
    result?;
    sync_parent(target);
    Ok(())
}

/// Rename `from` to `to` without replacing an existing `to`.
pub fn rename_no_clobber(from: &Path, to: &Path) -> AppResult<()> {
    if from == to {
        return Ok(());
    }
    // Case-only renames on case-insensitive filesystems report `to` as existing.
    let case_only = from.parent() == to.parent()
        && from.file_name().map(|n| n.to_string_lossy().to_lowercase())
            == to.file_name().map(|n| n.to_string_lossy().to_lowercase());
    if case_only {
        fs::rename(from, to).with_path("rename", from)?;
    } else {
        link_no_clobber(from, to)?;
        fs::remove_file(from).with_path("rename", from)?;
    }
    sync_parent(from);
    sync_parent(to);
    Ok(())
}

/// Hard-link based no-clobber placement, with a check-then-rename fallback for
/// filesystems that do not support hard links (e.g. some FUSE mounts).
fn link_no_clobber(from: &Path, to: &Path) -> AppResult<()> {
    match fs::hard_link(from, to) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {
            Err(AppError::AlreadyExists(format!("“{}” already exists", to.display())))
        }
        Err(_) => {
            if to.symlink_metadata().is_ok() {
                return Err(AppError::AlreadyExists(format!("“{}” already exists", to.display())));
            }
            fs::copy(from, to).with_path("write", to)?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_atomic_creates_and_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.md");
        write_atomic(&target, b"one").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "one");
        write_atomic(&target, b"two").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "two");
        let leftovers: Vec<_> =
            fs::read_dir(dir.path()).unwrap().filter_map(|e| e.ok()).filter(|e| is_temp_file(&e.path())).collect();
        assert!(leftovers.is_empty(), "temporary files must be cleaned up");
    }

    #[test]
    fn write_new_atomic_refuses_to_clobber() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.md");
        write_new_atomic(&target, b"first").unwrap();
        let err = write_new_atomic(&target, b"second").unwrap_err();
        assert!(matches!(err, AppError::AlreadyExists(_)));
        assert_eq!(fs::read_to_string(&target).unwrap(), "first");
    }

    #[test]
    fn rename_no_clobber_refuses_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        assert!(rename_no_clobber(&a, &b).is_err());
        assert_eq!(fs::read_to_string(&b).unwrap(), "b");
        assert!(a.exists());
    }

    #[test]
    fn temp_names_round_trip() {
        let target = Path::new("/notes/My note.md");
        let tmp = temp_path_for(target).unwrap();
        assert!(is_temp_file(&tmp));
        assert_eq!(temp_target(&tmp).unwrap(), target);
        assert!(!is_temp_file(target));
    }
}

//! Validation of library-relative paths received from the frontend.
//!
//! The frontend never sends absolute paths. It addresses folders with
//! `/`-separated paths relative to the notes directory (`""` is the root).
//! Every such path is validated here before it touches the filesystem.

use crate::error::{AppError, AppResult};
use std::path::{Component, Path, PathBuf};

pub const MAX_REL_PATH_BYTES: usize = 1024;
pub const MAX_FOLDER_DEPTH: usize = 16;

/// Validate a folder path such as `Work/Projects`. The empty string is the root.
pub fn validate_folder_path(rel: &str) -> AppResult<()> {
    if rel.is_empty() {
        return Ok(());
    }
    if rel.len() > MAX_REL_PATH_BYTES {
        return Err(AppError::invalid("Folder path is too long"));
    }
    if rel.starts_with('/') || rel.ends_with('/') || rel.contains('\\') || rel.contains('\0') {
        return Err(AppError::invalid("Invalid folder path"));
    }
    let mut depth = 0;
    for part in rel.split('/') {
        depth += 1;
        if part.is_empty() || part == "." || part == ".." || part.starts_with('.') {
            return Err(AppError::invalid("Invalid folder path"));
        }
        if part.chars().any(|c| c.is_control()) {
            return Err(AppError::invalid("Invalid folder path"));
        }
    }
    if depth > MAX_FOLDER_DEPTH {
        return Err(AppError::invalid("Folders are nested too deeply"));
    }
    Ok(())
}

/// Join a validated relative path onto the library root.
pub fn resolve(root: &Path, rel: &str) -> AppResult<PathBuf> {
    validate_folder_path(rel)?;
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }
    Ok(root.join(rel))
}

/// Resolve a folder that must already exist as a real directory inside `root`
/// (symlinks pointing outside the library are rejected).
pub fn resolve_existing_dir(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let path = resolve(root, rel)?;
    let meta = path.symlink_metadata().map_err(|_| AppError::not_found(format!("Folder “{rel}” does not exist")))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err(AppError::not_found(format!("Folder “{rel}” does not exist")));
    }
    ensure_inside(root, &path)?;
    Ok(path)
}

/// Check that an existing path, after resolving symlinks, is inside `root`.
pub fn ensure_inside(root: &Path, path: &Path) -> AppResult<()> {
    let canonical = path
        .canonicalize()
        .map_err(|e| AppError::Io { message: format!("Could not resolve “{}”: {e}", path.display()) })?;
    if !canonical.starts_with(root) {
        return Err(AppError::invalid("Path is outside the notes folder"));
    }
    Ok(())
}

/// Convert an absolute path inside `root` to a `/`-separated relative path.
pub fn to_rel(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in rel.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_str()?.to_string()),
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

/// Parent folder of a relative file path (`"a/b/c.md"` → `"a/b"`).
pub fn parent_of(rel: &str) -> &str {
    rel.rsplit_once('/').map(|(parent, _)| parent).unwrap_or("")
}

/// Last component of a relative path.
pub fn name_of(rel: &str) -> &str {
    rel.rsplit_once('/').map(|(_, name)| name).unwrap_or(rel)
}

pub fn join_rel(parent: &str, name: &str) -> String {
    if parent.is_empty() { name.to_string() } else { format!("{parent}/{name}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_paths() {
        for ok in ["", "Work", "Work/Projects", "Günlük/2026", "a b/c d"] {
            assert!(validate_folder_path(ok).is_ok(), "{ok:?} should be valid");
        }
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        for bad in ["..", "../x", "a/../b", "/etc", "a/", "a//b", ".trash", "a/.hidden", "a\\b", "a\0b", ".", "./a"] {
            assert!(validate_folder_path(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn rejects_symlink_escape() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root_path = root.path().canonicalize().unwrap();
        std::os::unix::fs::symlink(outside.path(), root_path.join("escape")).unwrap();
        assert!(resolve_existing_dir(&root_path, "escape").is_err());
        std::fs::create_dir(root_path.join("inside")).unwrap();
        assert!(resolve_existing_dir(&root_path, "inside").is_ok());
    }

    #[test]
    fn relative_helpers() {
        assert_eq!(parent_of("a/b/c.md"), "a/b");
        assert_eq!(parent_of("c.md"), "");
        assert_eq!(name_of("a/b/c.md"), "c.md");
        assert_eq!(join_rel("", "x"), "x");
        assert_eq!(join_rel("a", "x"), "a/x");
        let root = Path::new("/notes");
        assert_eq!(to_rel(root, Path::new("/notes/a/b.md")).unwrap(), "a/b.md");
        assert!(to_rel(root, Path::new("/other/b.md")).is_none());
    }
}

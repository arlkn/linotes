//! Low-level filesystem helpers: atomic writes, name sanitisation, path
//! validation, crash recovery and change watching.

pub mod atomic;
pub mod recovery;
pub mod safe_path;
pub mod sanitize;
pub mod watcher;

use sha2::{Digest, Sha256};
use std::fs::Metadata;
use std::time::UNIX_EPOCH;

/// Extensions recognised as notes.
pub const NOTE_EXTENSIONS: &[&str] = &["md", "markdown"];
/// Name of the trash directory at the root of the notes folder.
pub const TRASH_DIR: &str = ".trash";
/// Folder at the root of the notes folder that holds the images notes link to.
pub const ATTACHMENTS_DIR: &str = "attachments";

pub fn is_note_file_name(name: &str) -> bool {
    !name.starts_with('.')
        && name
            .rsplit_once('.')
            .is_some_and(|(stem, ext)| !stem.is_empty() && NOTE_EXTENSIONS.iter().any(|e| e.eq_ignore_ascii_case(ext)))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest.iter() {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub fn mtime_ns(meta: &Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_note_files() {
        assert!(is_note_file_name("Note.md"));
        assert!(is_note_file_name("Note.MARKDOWN"));
        assert!(!is_note_file_name(".hidden.md"));
        assert!(!is_note_file_name(".md"));
        assert!(!is_note_file_name("image.png"));
        assert!(!is_note_file_name("README"));
    }

    #[test]
    fn hashes_are_hex() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}

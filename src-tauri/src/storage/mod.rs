//! The notes library: Markdown files on disk plus the SQLite index.
//!
//! [`Library`] is the only component that writes to the notes folder. All
//! mutations follow the same pattern: validate input, perform an atomic
//! filesystem operation, then update the index from what is now on disk.

mod attachments;
mod folders;
mod library;
pub mod markdown;
pub mod note_file;
mod sync;
#[cfg(test)]
mod tests;

pub use attachments::{
    AddedFile, IMAGE_EXTENSIONS, ImportedImages, LinkedFile, MAX_IMAGE_BYTES, percent_decode, read_image,
};
pub use folders::{DeleteFolderReport, FolderInfo};
pub use library::Library;
pub(crate) use library::lowercase_names;
pub use sync::{SkippedFile, SyncReport};

use crate::database::repo::NoteSummary;
use serde::{Deserialize, Serialize};

/// A note as loaded into the editor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    #[serde(flatten)]
    pub summary: NoteSummary,
    /// Markdown body without frontmatter.
    pub content: String,
    /// Revision token (hash of the body). Sent back on save for conflict detection.
    pub rev: String,
    /// Absolute path of the file, for display.
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: String,
    pub title: String,
    pub content: String,
    /// The `rev` the editor started from.
    pub expected_rev: String,
    /// Overwrite even if the file changed on disk (after the user chose to),
    /// or recreate the file if it went missing.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedNote {
    pub summary: NoteSummary,
    pub rev: String,
    pub path: String,
}

/// Limits that keep a single bad input from exhausting memory.
pub const MAX_NOTE_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_TITLE_CHARS: usize = 500;

//! Tauri commands: the complete IPC surface available to the webview.
//!
//! Every command is listed in `build.rs` and must be granted explicitly in
//! `capabilities/default.json`. Commands never accept absolute filesystem
//! paths from the frontend; notes are addressed by id and folders by
//! validated library-relative paths. Paths for import/export and for the notes
//! folder come from native dialogs opened here, on the Rust side.

pub mod app;
pub mod files;
pub mod folders;
pub mod import_export;
pub mod library;
pub mod notes;
pub mod search;
pub mod settings;

use crate::error::{AppError, AppResult};

/// Run blocking work (filesystem, SQLite, dialogs) off the async runtime's core threads.
pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("Background task failed: {e}")))?
}

//! Watching the notes folder for changes made outside Linotes.
//!
//! Events are debounced and coalesced; the callback then triggers an index
//! sync. Changes Linotes makes itself are recognised during that sync (the
//! index already matches the file), so they do not produce notifications.

use crate::error::{AppError, AppResult};
use crate::filesystem::atomic::is_temp_file;
use notify::{EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};
use std::path::Path;
use std::time::Duration;

pub struct LibraryWatcher {
    _debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
}

pub fn watch(root: &Path, on_change: impl Fn() + Send + 'static) -> AppResult<LibraryWatcher> {
    let handler = move |result: DebounceEventResult| match result {
        Ok(events) => {
            let relevant = events.iter().any(|event| {
                !matches!(event.kind, EventKind::Access(_)) && event.paths.iter().any(|p| !is_temp_file(p))
            });
            if relevant {
                on_change();
            }
        }
        Err(errors) => {
            for error in errors {
                log::warn!("File watcher error: {error}");
            }
        }
    };
    let mut debouncer = new_debouncer(Duration::from_millis(400), None, handler)
        .map_err(|e| AppError::Internal(format!("Could not start the file watcher: {e}")))?;
    debouncer.watch(root, RecursiveMode::Recursive).map_err(|e| {
        AppError::Internal(format!(
            "Could not watch the notes folder for outside changes ({e}). Linotes still works, but changes made \
             by other programs appear only after a restart."
        ))
    })?;
    Ok(LibraryWatcher { _debouncer: debouncer })
}

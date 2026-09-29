use super::blocking;
use crate::error::{AppError, AppResult};
use crate::security;
use crate::state::{AppState, LibraryStatus, lock};
use crate::storage::SyncReport;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn get_library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    lock(&state.status).clone()
}

/// Let the user pick a new notes folder with the native folder picker.
/// Returns `None` if the dialog was cancelled.
#[tauri::command]
pub async fn choose_notes_directory(app: AppHandle) -> AppResult<Option<LibraryStatus>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let (current, _) = state.notes_dir();
        let mut dialog = app.dialog().file().set_title("Choose a folder for your notes");
        if current.exists() {
            dialog = dialog.set_directory(&current);
        }
        let Some(picked) = dialog.blocking_pick_folder() else { return Ok(None) };
        let path = picked.into_path().map_err(|e| AppError::invalid(format!("Unsupported folder: {e}")))?;
        let path = path.canonicalize().unwrap_or(path);
        let home = dirs::home_dir();
        let app_dirs =
            [state.paths.config_dir.as_path(), state.paths.data_dir.as_path(), state.paths.cache_dir.as_path()];
        security::validate_notes_dir(&path, home.as_deref(), &app_dirs)?;

        let status = state.open_library_at(&app, path.clone(), false)?;
        let mut settings = lock(&state.settings);
        let mut updated = settings.clone();
        updated.notes_dir = Some(status.root.clone());
        updated.last_note_id = None;
        state.save_settings(&updated)?;
        *settings = updated;
        Ok(Some(status))
    })
    .await
}

/// Switch back to the default notes folder (`~/Documents/Linotes`).
#[tauri::command]
pub async fn use_default_notes_directory(app: AppHandle) -> AppResult<LibraryStatus> {
    blocking(move || {
        let state = app.state::<AppState>();
        let root = state.paths.default_notes_dir.clone();
        let status = state.open_library_at(&app, root, true)?;
        let mut settings = lock(&state.settings);
        let mut updated = settings.clone();
        updated.notes_dir = None;
        updated.last_note_id = None;
        state.save_settings(&updated)?;
        *settings = updated;
        Ok(status)
    })
    .await
}

/// Retry opening the configured notes folder (e.g. after plugging in a drive).
#[tauri::command]
pub async fn retry_open_library(app: AppHandle) -> AppResult<LibraryStatus> {
    blocking(move || Ok(app.state::<AppState>().open_configured_library(&app))).await
}

#[tauri::command]
pub async fn open_notes_folder(app: AppHandle) -> AppResult<()> {
    blocking(move || {
        let root = app.state::<AppState>().with_library(|lib| Ok(lib.root().to_path_buf()))?;
        app.opener()
            .open_path(root.to_string_lossy(), None::<&str>)
            .map_err(|e| AppError::Internal(format!("Could not open the file manager: {e}")))
    })
    .await
}

/// Show a note's file in the system file manager.
#[tauri::command]
pub async fn reveal_note_file(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || {
        let path = app.state::<AppState>().with_library(|lib| lib.read_note(&id).map(|n| n.path))?;
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|e| AppError::Internal(format!("Could not open the file manager: {e}")))
    })
    .await
}

/// Re-read every note from disk and rebuild the search index.
#[tauri::command]
pub async fn rebuild_index(app: AppHandle) -> AppResult<SyncReport> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.sync_all(true))).await
}

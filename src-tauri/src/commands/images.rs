use super::blocking;
use crate::error::{AppError, AppResult, IoContext};
use crate::state::AppState;
use crate::storage::{IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, SavedImage, percent_decode};
use std::fs;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// Store an image pasted or dropped into a note. The image is the raw request
/// body; the note id and the original file name come in headers.
#[tauri::command]
pub async fn save_image(app: AppHandle, request: Request<'_>) -> AppResult<SavedImage> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid("Expected image data."));
    };
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(percent_decode);
    let note_id = header("x-note-id").ok_or_else(|| AppError::invalid("Missing note id."))?;
    let name = header("x-file-name").unwrap_or_default();
    let bytes = bytes.clone();
    blocking(move || app.state::<AppState>().with_library(|lib| lib.save_image(&note_id, &name, &bytes))).await
}

/// Pick an image with the file chooser and add it to a note. `None` if cancelled.
#[tauri::command]
pub async fn choose_image(app: AppHandle, note_id: String) -> AppResult<Option<SavedImage>> {
    blocking(move || {
        let picked =
            app.dialog().file().set_title("Insert image").add_filter("Images", IMAGE_EXTENSIONS).blocking_pick_file();
        let Some(file) = picked else { return Ok(None) };
        let path = file.into_path().map_err(|e| AppError::invalid(format!("Unsupported location: {e}")))?;
        let size = fs::metadata(&path).with_path("read", &path)?.len();
        if size > MAX_IMAGE_BYTES as u64 {
            return Err(AppError::invalid("Images can be at most 25 MB."));
        }
        let bytes = fs::read(&path).with_path("read", &path)?;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        app.state::<AppState>().with_library(|lib| lib.save_image(&note_id, &name, &bytes)).map(Some)
    })
    .await
}

use super::blocking;
use crate::database::repo::NoteSummary;
use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{Note, SaveNoteInput, SavedNote};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn list_notes(app: AppHandle) -> AppResult<Vec<NoteSummary>> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.list_notes())).await
}

#[tauri::command]
pub async fn read_note(app: AppHandle, id: String) -> AppResult<Note> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.read_note(&id))).await
}

#[tauri::command]
pub async fn create_note(app: AppHandle, folder: String, title: Option<String>) -> AppResult<Note> {
    blocking(move || {
        app.state::<AppState>().with_library(|lib| lib.create_note(&folder, title.as_deref().unwrap_or(""), ""))
    })
    .await
}

#[tauri::command]
pub async fn save_note(app: AppHandle, input: SaveNoteInput) -> AppResult<SavedNote> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.save_note(input))).await
}

#[tauri::command]
pub async fn set_favorite(app: AppHandle, id: String, favorite: bool) -> AppResult<NoteSummary> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.set_favorite(&id, favorite))).await
}

#[tauri::command]
pub async fn move_note(app: AppHandle, id: String, folder: String) -> AppResult<NoteSummary> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.move_note(&id, &folder))).await
}

#[tauri::command]
pub async fn trash_note(app: AppHandle, id: String) -> AppResult<NoteSummary> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.trash_note(&id))).await
}

#[tauri::command]
pub async fn restore_note(app: AppHandle, id: String) -> AppResult<NoteSummary> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.restore_note(&id))).await
}

#[tauri::command]
pub async fn delete_note_permanently(app: AppHandle, id: String) -> AppResult<()> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.delete_note_permanently(&id))).await
}

#[tauri::command]
pub async fn empty_trash(app: AppHandle) -> AppResult<u32> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.empty_trash())).await
}

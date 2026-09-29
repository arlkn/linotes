use super::blocking;
use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::{DeleteFolderReport, FolderInfo};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn list_folders(app: AppHandle) -> AppResult<Vec<FolderInfo>> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.list_folders())).await
}

#[tauri::command]
pub async fn create_folder(app: AppHandle, parent: String, name: String) -> AppResult<FolderInfo> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.create_folder(&parent, &name))).await
}

#[tauri::command]
pub async fn rename_folder(app: AppHandle, path: String, new_name: String) -> AppResult<FolderInfo> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.rename_folder(&path, &new_name))).await
}

#[tauri::command]
pub async fn delete_folder(app: AppHandle, path: String) -> AppResult<DeleteFolderReport> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.delete_folder(&path))).await
}

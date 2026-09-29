use super::blocking;
use crate::error::AppResult;
use crate::search::{SearchHit, SearchQuery};
use crate::state::AppState;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn search_notes(app: AppHandle, query: SearchQuery) -> AppResult<Vec<SearchHit>> {
    blocking(move || app.state::<AppState>().with_library(|lib| lib.search(&query))).await
}

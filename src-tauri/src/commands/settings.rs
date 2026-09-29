use crate::error::AppResult;
use crate::settings::Settings;
use crate::state::{AppState, lock};
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    lock(&state.settings).clone()
}

/// Apply a partial settings update (`{ "theme": "dark" }`) and persist it.
#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, patch: serde_json::Value) -> AppResult<Settings> {
    let mut guard = lock(&state.settings);
    let updated = guard.apply_patch(patch)?;
    state.save_settings(&updated)?;
    *guard = updated.clone();
    Ok(updated)
}

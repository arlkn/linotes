use crate::error::{AppError, AppResult};
use crate::security;
use crate::state::{AppState, lock};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Theme, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub license: &'static str,
    pub tauri_version: &'static str,
    pub config_dir: String,
    pub data_dir: String,
    pub notes_dir: String,
}

/// The frontend has finished starting up. The window opens visible, so this
/// only brings it back if something hid it in the meantime.
#[tauri::command]
pub fn app_ready(window: WebviewWindow) -> AppResult<()> {
    crate::show_main_window(&window);
    Ok(())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let state = app.state::<AppState>();
    let info = app.package_info();
    AppInfo {
        name: "Linotes".into(),
        version: info.version.to_string(),
        license: "MIT",
        tauri_version: tauri::VERSION,
        config_dir: state.paths.config_dir.display().to_string(),
        data_dir: state.paths.data_dir.display().to_string(),
        notes_dir: lock(&state.status).root.clone(),
    }
}

/// Open an http(s) or mailto link in the user's default application.
#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> AppResult<()> {
    security::validate_external_url(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| AppError::Internal(format!("Could not open the link: {e}")))
}

/// Match the window frame (the title bar drawn by GTK) to the theme the interface
/// shows, and return that theme. For `system`, the desktop's own preference from
/// the XDG portal wins; `fallback` (the web view's guess) is used without a portal.
#[tauri::command]
pub async fn apply_window_theme(window: WebviewWindow, preference: String, fallback: String) -> AppResult<String> {
    super::blocking(move || {
        let theme = match preference.as_str() {
            "dark" => Theme::Dark,
            "light" => Theme::Light,
            "system" => {
                crate::desktop::system_theme().unwrap_or(if fallback == "dark" { Theme::Dark } else { Theme::Light })
            }
            _ => return Err(AppError::invalid("Unknown theme")),
        };
        window.set_theme(Some(theme)).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(crate::desktop::theme_name(theme).to_string())
    })
    .await
}

/// The frontend finished saving after a close request; close the window.
#[tauri::command]
pub fn confirm_close(app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    app.state::<AppState>().close_pending.store(false, Ordering::SeqCst);
    crate::persist_window_geometry(&app, &window);
    window.destroy().map_err(|e| AppError::Internal(e.to_string()))
}

/// The user chose to keep the window open (e.g. after a failed save).
#[tauri::command]
pub fn cancel_close(app: AppHandle) {
    app.state::<AppState>().close_pending.store(false, Ordering::SeqCst);
}

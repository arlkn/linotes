//! Linotes — a local-first Markdown notes app for Linux.
//!
//! Architecture (see `docs/ARCHITECTURE.md`):
//! * `storage`    — the notes library: Markdown files are the source of truth.
//! * `database`   — SQLite index + FTS5 search (a rebuildable cache).
//! * `filesystem` — atomic writes, recovery, path validation, file watching.
//! * `commands`   — the IPC surface exposed to the webview.

mod commands;
mod database;
mod desktop;
mod error;
mod filesystem;
mod import_export;
mod paths;
mod search;
mod security;
mod settings;
mod state;
mod storage;

use state::{AppState, lock};
use std::sync::atomic::Ordering;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const MAIN_WINDOW: &str = "main";
/// Sent to the frontend when the user closes the window, so pending edits can be saved first.
pub const EVENT_CLOSE_REQUESTED: &str = "app-close-requested";

pub fn run() {
    let paths = match paths::AppPaths::from_env() {
        Ok(paths) => paths,
        Err(err) => {
            eprintln!("Linotes cannot start: {err}");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
                .level_for("notify", log::LevelFilter::Warn)
                .level_for("notify_debouncer_full", log::LevelFilter::Warn)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(paths))
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            state.open_configured_library(&handle);
            let (geometry, theme) = {
                let settings = lock(&state.settings);
                (settings.window.clone(), desktop::initial_theme(settings.theme))
            };
            create_main_window(app, &geometry, theme)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                // First request: let the frontend save pending edits, then it calls `confirm_close`.
                // A second request (e.g. an unresponsive page) closes immediately.
                if !state.close_pending.swap(true, Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = app.emit(EVENT_CLOSE_REQUESTED, ());
                } else if let Some(webview) = app.get_webview_window(window.label()) {
                    persist_window_geometry(app, &webview);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::notes::list_notes,
            commands::notes::read_note,
            commands::notes::create_note,
            commands::notes::save_note,
            commands::notes::set_favorite,
            commands::notes::move_note,
            commands::notes::trash_note,
            commands::notes::restore_note,
            commands::notes::delete_note_permanently,
            commands::notes::empty_trash,
            commands::folders::list_folders,
            commands::folders::create_folder,
            commands::folders::rename_folder,
            commands::folders::delete_folder,
            commands::search::search_notes,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::library::get_library_status,
            commands::library::choose_notes_directory,
            commands::library::use_default_notes_directory,
            commands::library::retry_open_library,
            commands::library::open_notes_folder,
            commands::library::reveal_note_file,
            commands::library::rebuild_index,
            commands::import_export::import_files,
            commands::import_export::import_folder,
            commands::import_export::export_note,
            commands::import_export::export_zip,
            commands::app::app_ready,
            commands::app::get_app_info,
            commands::app::open_external_url,
            commands::app::apply_window_theme,
            commands::app::confirm_close,
            commands::app::cancel_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Linotes");
}

/// The main window is created here (not in tauri.conf.json) so it can carry
/// navigation guards: the webview may only ever show Linotes' own pages.
///
/// It opens visible, in the saved theme's colours. (A window created hidden has
/// no size on Linux, so the page would lay out at 0×0 and its first frame would
/// be misplaced when the window appeared.)
fn create_main_window(
    app: &tauri::App,
    geometry: &settings::WindowGeometry,
    theme: Theme,
) -> tauri::Result<WebviewWindow> {
    let dev_url = if cfg!(debug_assertions) { app.config().build.dev_url.clone() } else { None };
    WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
        .title("Linotes")
        .inner_size(f64::from(geometry.width), f64::from(geometry.height))
        .min_inner_size(720.0, 480.0)
        .maximized(geometry.maximized)
        .center()
        .theme(Some(theme))
        .background_color(desktop::background_color(theme))
        // Read by src/main.tsx so the first paint already uses the right theme.
        .initialization_script(format!("window.__LINOTES_THEME__ = '{}';", desktop::theme_name(theme)))
        .disable_drag_drop_handler()
        .on_navigation(move |url| {
            let allowed = security::is_app_url(url, dev_url.as_ref());
            if !allowed {
                log::warn!("Blocked navigation to {url}");
            }
            allowed
        })
        .on_new_window(|url, _features| {
            log::warn!("Blocked a new window for {url}");
            NewWindowResponse::Deny
        })
        .build()
}

pub(crate) fn show_main_window(window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Remember the window size for the next start (positions are not restorable on Wayland).
pub(crate) fn persist_window_geometry(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<AppState>();
    let maximized = window.is_maximized().unwrap_or(false);
    let mut settings = lock(&state.settings);
    let mut updated = settings.clone();
    updated.window.maximized = maximized;
    if !maximized && let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let logical = size.to_logical::<f64>(scale);
        updated.window.width = logical.width.round() as u32;
        updated.window.height = logical.height.round() as u32;
    }
    let updated = updated.sanitized();
    if updated != *settings {
        if let Err(err) = state.save_settings(&updated) {
            log::warn!("Could not save window size: {err}");
        }
        *settings = updated;
    }
}

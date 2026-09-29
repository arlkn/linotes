//! Process-wide state shared by Tauri commands.

use crate::error::{AppError, AppResult};
use crate::filesystem::recovery::RecoveredFile;
use crate::filesystem::watcher::{self, LibraryWatcher};
use crate::paths::AppPaths;
use crate::settings::Settings;
use crate::storage::{Library, SkippedFile};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT_LIBRARY_CHANGED: &str = "library-changed";

pub struct AppState {
    pub paths: AppPaths,
    pub settings: Mutex<Settings>,
    pub library: Mutex<Option<Library>>,
    pub status: Mutex<LibraryStatus>,
    watcher: Mutex<Option<LibraryWatcher>>,
    /// Set when the user asked to close the window and the frontend is flushing saves.
    pub close_pending: AtomicBool,
}

/// What the frontend needs to know about the notes folder.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub root: String,
    pub is_default: bool,
    pub ready: bool,
    pub error: Option<String>,
    pub recovered: Vec<RecoveredFile>,
    pub skipped: Vec<SkippedFile>,
    pub rebuilt_index: Option<String>,
    pub watcher_error: Option<String>,
}

/// Lock a mutex, recovering from poisoning (a panicked command must not brick the app).
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl AppState {
    pub fn new(paths: AppPaths) -> Self {
        let settings = Settings::load(&paths.settings_file());
        AppState {
            paths,
            settings: Mutex::new(settings),
            library: Mutex::new(None),
            status: Mutex::new(LibraryStatus::default()),
            watcher: Mutex::new(None),
            close_pending: AtomicBool::new(false),
        }
    }

    pub fn notes_dir(&self) -> (PathBuf, bool) {
        match lock(&self.settings).notes_dir.clone() {
            Some(dir) => (PathBuf::from(dir), false),
            None => (self.paths.default_notes_dir.clone(), true),
        }
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        settings.save(&self.paths.settings_file())
    }

    pub fn with_library<T>(&self, f: impl FnOnce(&mut Library) -> AppResult<T>) -> AppResult<T> {
        let mut guard = lock(&self.library);
        let library =
            guard.as_mut().ok_or_else(|| AppError::Unavailable("The notes folder is not available.".into()))?;
        f(library)
    }

    /// Open the configured notes folder (used at startup and after changing folders).
    pub fn open_configured_library(&self, app: &AppHandle) -> LibraryStatus {
        let (root, is_default) = self.notes_dir();
        match self.open_library_at(app, root.clone(), is_default) {
            Ok(status) => status,
            Err(err) => {
                log::error!("Could not open notes folder {}: {err}", root.display());
                let status = LibraryStatus {
                    root: root.display().to_string(),
                    is_default,
                    ready: false,
                    error: Some(err.to_string()),
                    ..Default::default()
                };
                *lock(&self.status) = status.clone();
                status
            }
        }
    }

    /// Open a library and make it current. The previous library stays active if this fails.
    pub fn open_library_at(&self, app: &AppHandle, root: PathBuf, is_default: bool) -> AppResult<LibraryStatus> {
        let (library, report) = Library::open(&root, is_default, &self.paths.index_dir(), &self.paths.recovery_dir())?;
        let canonical = library.root().to_path_buf();

        // Stop watching the old folder before swapping libraries.
        *lock(&self.watcher) = None;
        *lock(&self.library) = Some(library);

        let handle = app.clone();
        let watcher_error = match watcher::watch(&canonical, move || on_external_change(&handle)) {
            Ok(w) => {
                *lock(&self.watcher) = Some(w);
                None
            }
            Err(err) => {
                log::warn!("{err}");
                Some(err.to_string())
            }
        };

        let status = LibraryStatus {
            root: canonical.display().to_string(),
            is_default,
            ready: true,
            error: None,
            recovered: report.recovered,
            skipped: report.sync.skipped,
            rebuilt_index: report.replaced_corrupt_index,
            watcher_error,
        };
        *lock(&self.status) = status.clone();
        Ok(status)
    }
}

/// Called on the watcher thread when files change on disk.
fn on_external_change(app: &AppHandle) {
    let state = app.state::<AppState>();
    let result = {
        let mut guard = lock(&state.library);
        guard.as_mut().map(|library| library.sync_all(false))
    };
    match result {
        Some(Ok(report)) if report.has_changes() => {
            if let Err(err) = app.emit(EVENT_LIBRARY_CHANGED, &report) {
                log::warn!("Could not notify the window about changes: {err}");
            }
        }
        Some(Err(err)) => log::warn!("Index sync after an outside change failed: {err}"),
        _ => {}
    }
}

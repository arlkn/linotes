//! Adding images and other files to notes, and opening the files notes link to.
//!
//! WebKitGTK gives the page no data for files dropped from the file manager or
//! pasted after copying them there (nor for a copied picture): those are read
//! here, natively. Paths still never come from the web view — dropped paths
//! are kept by the backend and claimed by id.

use super::blocking;
use crate::error::{AppError, AppResult, IoContext};
use crate::state::AppState;
use crate::storage::{AddedFile, IMAGE_EXTENSIONS, Library, LinkedFile, MAX_IMAGE_BYTES, percent_decode};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Files added to a note, and the ones that couldn't be.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedFiles {
    pub added: Vec<AddedFile>,
    pub failed: Vec<FailedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedFile {
    pub name: String,
    pub reason: String,
}

fn add_files(library: &mut Library, note_id: &str, paths: &[PathBuf]) -> AddedFiles {
    let mut result = AddedFiles::default();
    for path in paths {
        match library.add_file(note_id, path) {
            Ok(file) => result.added.push(file),
            Err(err) => result.failed.push(FailedFile {
                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                reason: err.to_string(),
            }),
        }
    }
    result
}

/// Store an image pasted or dropped into the page (where the browser engine
/// provides it). The image is the raw request body; the note id and the
/// original file name come in headers.
#[tauri::command]
pub async fn save_image(app: AppHandle, request: Request<'_>) -> AppResult<AddedFile> {
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
pub async fn choose_image(app: AppHandle, note_id: String) -> AppResult<Option<AddedFile>> {
    blocking(move || {
        let picked =
            app.dialog().file().set_title("Insert image").add_filter("Images", IMAGE_EXTENSIONS).blocking_pick_file();
        let Some(file) = picked else { return Ok(None) };
        let path = file.into_path().map_err(|e| AppError::invalid(format!("Unsupported location: {e}")))?;
        let size = fs::metadata(&path).with_path("read", &path)?.len();
        if size > MAX_IMAGE_BYTES as u64 {
            return Err(AppError::invalid("Images can be at most 25 MB."));
        }
        app.state::<AppState>().with_library(|lib| lib.add_file(&note_id, &path)).map(Some)
    })
    .await
}

/// Add the files of a drop (announced by the `files-dropped` event) to a note.
#[tauri::command]
pub async fn add_dropped_files(app: AppHandle, note_id: String, drop_id: u64) -> AppResult<AddedFiles> {
    blocking(move || {
        let state = app.state::<AppState>();
        let paths = state.take_dropped_files(drop_id).ok_or_else(|| AppError::not_found("Those files are gone."))?;
        state.with_library(|lib| Ok(add_files(lib, &note_id, &paths)))
    })
    .await
}

/// Paste files copied in the file manager, or a copied picture, into a note.
#[tauri::command]
pub async fn paste_files(app: AppHandle, note_id: String) -> AppResult<AddedFiles> {
    blocking(move || {
        let clipboard = read_clipboard(&app)?;
        app.state::<AppState>().with_library(|lib| match clipboard {
            Clipboard::Files(paths) => Ok(add_files(lib, &note_id, &paths)),
            Clipboard::Image(png) => {
                Ok(AddedFiles { added: vec![lib.save_image(&note_id, "image.png", &png)?], failed: Vec::new() })
            }
            Clipboard::Nothing => Ok(AddedFiles::default()),
        })
    })
    .await
}

/// Open a file a note links to in its usual app — or, for kinds of files that
/// could run a program, show it in Files instead.
#[tauri::command]
pub async fn open_linked_file(app: AppHandle, note_id: String, link: String) -> AppResult<()> {
    blocking(move || {
        let file = app.state::<AppState>().with_library(|lib| lib.linked_file(&note_id, &link))?;
        let opener = app.opener();
        let result = match &file {
            LinkedFile::Open(path) => opener.open_path(path.to_string_lossy(), None::<&str>),
            LinkedFile::Reveal(path) => opener.reveal_item_in_dir(path),
        };
        result.map_err(|e| AppError::Internal(format!("Could not open the file: {e}")))
    })
    .await
}

enum Clipboard {
    Files(Vec<PathBuf>),
    Image(Vec<u8>),
    Nothing,
}

/// Read the clipboard on the main thread, where GTK lives (this waits for it).
fn read_clipboard(app: &AppHandle) -> AppResult<Clipboard> {
    let (send, receive) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = send.send(system_clipboard());
    })
    .map_err(|e| AppError::Internal(format!("Could not read the clipboard: {e}")))?;
    receive.recv().map_err(|e| AppError::Internal(format!("Could not read the clipboard: {e}")))
}

#[cfg(target_os = "linux")]
fn system_clipboard() -> Clipboard {
    use gtk::prelude::*;
    let clipboard = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
    let paths: Vec<PathBuf> =
        clipboard.wait_for_uris().iter().filter_map(|uri| gtk::gio::File::for_uri(uri).path()).collect();
    if !paths.is_empty() {
        return Clipboard::Files(paths);
    }
    match clipboard.wait_for_image().map(|image| image.save_to_bufferv("png", &[])) {
        Some(Ok(png)) => Clipboard::Image(png),
        _ => Clipboard::Nothing,
    }
}

#[cfg(not(target_os = "linux"))]
fn system_clipboard() -> Clipboard {
    Clipboard::Nothing
}

/// Payload of the `files-dropped` event: files were dropped at (x, y) in the
/// window (CSS pixels); the page claims them with `add_dropped_files`.
#[derive(Debug, Clone, Serialize)]
pub struct FilesDropped {
    pub id: u64,
    pub x: f64,
    pub y: f64,
}

pub const EVENT_FILES_DROPPED: &str = "files-dropped";

/// Keep dropped files for the page to claim, and tell it where they landed.
pub fn files_dropped(app: &AppHandle, paths: Vec<PathBuf>, x: f64, y: f64) {
    use tauri::Emitter;
    let state = app.state::<AppState>();
    let id = state.keep_dropped_files(paths);
    if let Err(err) = app.emit(EVENT_FILES_DROPPED, FilesDropped { id, x, y }) {
        log::warn!("Could not tell the window about dropped files: {err}");
    }
}

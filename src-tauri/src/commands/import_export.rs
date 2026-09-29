use super::blocking;
use crate::error::{AppError, AppResult};
use crate::filesystem::sanitize::note_file_stem;
use crate::import_export::{ExportReport, ImportReport};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

fn to_path(file: FilePath) -> AppResult<PathBuf> {
    file.into_path().map_err(|e| AppError::invalid(format!("Unsupported location: {e}")))
}

/// Pick Markdown files and import them into `target_folder`. `None` if cancelled.
#[tauri::command]
pub async fn import_files(app: AppHandle, target_folder: String) -> AppResult<Option<ImportReport>> {
    blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Import Markdown files")
            .add_filter("Markdown and text", MARKDOWN_EXTENSIONS)
            .blocking_pick_files();
        let Some(files) = picked else { return Ok(None) };
        let paths = files.into_iter().map(to_path).collect::<AppResult<Vec<_>>>()?;
        app.state::<AppState>().with_library(|lib| lib.import_files(&paths, &target_folder)).map(Some)
    })
    .await
}

/// Pick a folder and import its Markdown files, preserving subfolders. `None` if cancelled.
#[tauri::command]
pub async fn import_folder(app: AppHandle, target_folder: String) -> AppResult<Option<ImportReport>> {
    blocking(move || {
        let picked = app.dialog().file().set_title("Import a folder of Markdown files").blocking_pick_folder();
        let Some(dir) = picked else { return Ok(None) };
        let dir = to_path(dir)?;
        app.state::<AppState>().with_library(|lib| lib.import_directory(&dir, &target_folder)).map(Some)
    })
    .await
}

/// Save a single note as a Markdown file chosen by the user. `None` if cancelled.
#[tauri::command]
pub async fn export_note(app: AppHandle, id: String) -> AppResult<Option<ExportReport>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let title = state.with_library(|lib| lib.read_note(&id).map(|n| n.summary.title))?;
        let picked = app
            .dialog()
            .file()
            .set_title("Export note")
            .set_file_name(format!("{}.md", note_file_stem(&title)))
            .add_filter("Markdown", &["md"])
            .blocking_save_file();
        let Some(dest) = picked else { return Ok(None) };
        let dest = with_extension(to_path(dest)?, "md");
        state.with_library(|lib| lib.export_note(&id, &dest)).map(Some)
    })
    .await
}

/// Export a folder (or everything, when `folder` is null) as a ZIP archive. `None` if cancelled.
#[tauri::command]
pub async fn export_zip(app: AppHandle, folder: Option<String>) -> AppResult<Option<ExportReport>> {
    blocking(move || {
        let base = match folder.as_deref() {
            Some(f) if !f.is_empty() => note_file_stem(crate::filesystem::safe_path::name_of(f)),
            _ => "Linotes".to_string(),
        };
        let stamp = chrono::Local::now().format("%Y-%m-%d");
        let picked = app
            .dialog()
            .file()
            .set_title("Export as ZIP archive")
            .set_file_name(format!("{base} {stamp}.zip"))
            .add_filter("ZIP archive", &["zip"])
            .blocking_save_file();
        let Some(dest) = picked else { return Ok(None) };
        let dest = with_extension(to_path(dest)?, "zip");
        app.state::<AppState>().with_library(|lib| lib.export_zip(folder.as_deref(), &dest)).map(Some)
    })
    .await
}

fn with_extension(path: PathBuf, ext: &str) -> PathBuf {
    let has = path.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext));
    if has {
        path
    } else {
        let mut os = path.into_os_string();
        os.push(format!(".{ext}"));
        PathBuf::from(os)
    }
}

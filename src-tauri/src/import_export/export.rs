use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::atomic::{TEMP_MARKER, is_temp_file, write_atomic};
use crate::filesystem::safe_path::{self, name_of};
use crate::filesystem::sha256_hex;
use crate::storage::Library;
use chrono::{DateTime, Datelike, Timelike, Utc};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, BufWriter};
use std::path::Path;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    /// Number of files written (1 for a single note).
    pub files: u32,
    pub destination: String,
}

impl Library {
    /// Copy a note's file (frontmatter included) to `destination`.
    pub fn export_note(&mut self, id: &str, destination: &Path) -> AppResult<ExportReport> {
        let row = self.row(id)?;
        let source = self.abs(&row.rel_path);
        let bytes = fs::read(&source).with_path("read", &source)?;
        write_atomic(destination, &bytes)?;
        Ok(ExportReport { files: 1, destination: destination.display().to_string() })
    }

    /// Write a ZIP archive of a folder (or the whole library when `folder` is `None`),
    /// preserving the directory structure. Hidden files and the trash are excluded;
    /// attachments stored next to notes are included.
    pub fn export_zip(&self, folder: Option<&str>, destination: &Path) -> AppResult<ExportReport> {
        let (base, prefix) = match folder {
            Some(folder) if !folder.is_empty() => {
                (safe_path::resolve_existing_dir(&self.root, folder)?, name_of(folder).to_string())
            }
            _ => (self.root.clone(), "Linotes".to_string()),
        };
        let dest_dir = destination.parent().ok_or_else(|| AppError::invalid("Invalid destination"))?;
        let token = &sha256_hex(uuid::Uuid::new_v4().as_bytes())[..10];
        let dest_name = destination.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let tmp = dest_dir.join(format!(".{dest_name}{TEMP_MARKER}-{token}"));

        let result = write_zip(&base, &prefix, &tmp);
        let files = match result {
            Ok(files) => files,
            Err(err) => {
                let _ = fs::remove_file(&tmp);
                return Err(err);
            }
        };
        if let Err(err) = fs::rename(&tmp, destination) {
            let _ = fs::remove_file(&tmp);
            return Err(err).with_path("save", destination);
        }
        Ok(ExportReport { files, destination: destination.display().to_string() })
    }
}

fn write_zip(base: &Path, prefix: &str, target: &Path) -> AppResult<u32> {
    let file = File::options().write(true).create_new(true).open(target).with_path("create", target)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let dir_options = SimpleFileOptions::default().unix_permissions(0o755);
    let mut files = 0;
    zip.add_directory(format!("{prefix}/"), dir_options).map_err(zip_error)?;

    let walker = WalkDir::new(base)
        .min_depth(1)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'));
    for entry in walker {
        let entry = entry.map_err(|e| AppError::Io { message: e.to_string() })?;
        let path = entry.path();
        let Some(rel) = safe_path::to_rel(base, path) else { continue };
        let name = format!("{prefix}/{rel}");
        if entry.file_type().is_dir() {
            zip.add_directory(format!("{name}/"), dir_options).map_err(zip_error)?;
        } else if entry.file_type().is_file() && !is_temp_file(path) {
            let modified = entry.metadata().ok().and_then(|m| m.modified().ok()).map(DateTime::<Utc>::from);
            let options = SimpleFileOptions::default()
                .compression_method(CompressionMethod::Deflated)
                .unix_permissions(0o644)
                .last_modified_time(zip_time(modified));
            zip.start_file(name, options).map_err(zip_error)?;
            let mut source = File::open(path).with_path("read", path)?;
            io::copy(&mut source, &mut zip).with_path("compress", path)?;
            files += 1;
        }
    }
    let writer = zip.finish().map_err(zip_error)?;
    let file = writer.into_inner().map_err(|e| AppError::Io { message: e.to_string() })?;
    file.sync_all().with_path("save", target)?;
    Ok(files)
}

fn zip_time(time: Option<DateTime<Utc>>) -> zip::DateTime {
    time.and_then(|t| {
        zip::DateTime::from_date_and_time(
            t.year().clamp(1980, 2107) as u16,
            t.month() as u8,
            t.day() as u8,
            t.hour() as u8,
            t.minute() as u8,
            t.second() as u8,
        )
        .ok()
    })
    .unwrap_or_default()
}

fn zip_error(err: zip::result::ZipError) -> AppError {
    AppError::Io { message: format!("Could not write the archive: {err}") }
}

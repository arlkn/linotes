use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::atomic::write_new_atomic;
use crate::filesystem::safe_path::{self, MAX_FOLDER_DEPTH, join_rel};
use crate::filesystem::sanitize::{self, note_file_stem, unique_dir_name, unique_file_name};
use crate::storage::note_file::{KEY_ID, NoteFile, Scalar};
use crate::storage::{Library, lowercase_names};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const MAX_IMPORT_FILE_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_IMPORT_FILES: usize = 10_000;
pub const IMPORT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: Vec<ImportedNote>,
    /// Files that were meant to be imported but could not be.
    pub failed: Vec<ImportIssue>,
    /// Files that were deliberately not imported (not Markdown, symlinks…).
    pub skipped: Vec<ImportIssue>,
    /// Folder created to hold an imported directory.
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedNote {
    pub source: String,
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIssue {
    pub source: String,
    pub reason: String,
}

fn has_import_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| IMPORT_EXTENSIONS.iter().any(|allowed| allowed.eq_ignore_ascii_case(ext)))
}

impl Library {
    /// Import individual files into `target_folder`.
    pub fn import_files(&mut self, sources: &[PathBuf], target_folder: &str) -> AppResult<ImportReport> {
        let dir = safe_path::resolve_existing_dir(&self.root, target_folder)?;
        let mut report = ImportReport::default();
        for source in sources {
            match self.import_one(source, &dir, target_folder) {
                Ok(note) => report.imported.push(note),
                Err(err) => {
                    report.failed.push(ImportIssue { source: source.display().to_string(), reason: err.to_string() })
                }
            }
        }
        Ok(report)
    }

    /// Import a directory tree into a new folder under `target_folder`, preserving structure.
    pub fn import_directory(&mut self, source_dir: &Path, target_folder: &str) -> AppResult<ImportReport> {
        let source = source_dir.canonicalize().with_path("open", source_dir)?;
        if source.starts_with(&self.root) || self.root.starts_with(&source) {
            return Err(AppError::invalid(
                "A folder can’t be imported into itself or into the notes folder it contains.",
            ));
        }
        let parent_dir = safe_path::resolve_existing_dir(&self.root, target_folder)?;

        // Collect first so limits are enforced before anything is written.
        let mut entries = Vec::new();
        let mut report = ImportReport::default();
        let walker = WalkDir::new(&source)
            .follow_links(false)
            .max_depth(MAX_FOLDER_DEPTH)
            .into_iter()
            .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));
        for entry in walker {
            match entry {
                Ok(entry) if entry.depth() > 0 => entries.push(entry),
                Ok(_) => {}
                Err(err) => report.failed.push(ImportIssue {
                    source: err.path().map(|p| p.display().to_string()).unwrap_or_default(),
                    reason: err.to_string(),
                }),
            }
            if entries.len() > MAX_IMPORT_FILES {
                return Err(AppError::invalid(format!(
                    "That folder contains more than {MAX_IMPORT_FILES} entries. Import smaller folders instead."
                )));
            }
        }

        let base_name = source
            .file_name()
            .and_then(|n| sanitize::folder_name(&n.to_string_lossy()).ok())
            .unwrap_or_else(|| "Imported notes".to_string());
        let taken = lowercase_names(&parent_dir);
        let top = unique_dir_name(&base_name, |n| taken.contains(&n.to_lowercase()));
        let top_rel = join_rel(target_folder, &top);
        fs::create_dir(parent_dir.join(&top)).with_path("create folder", &parent_dir.join(&top))?;
        report.folder = Some(top_rel.clone());

        for entry in entries {
            let path = entry.path();
            let display = path.display().to_string();
            // Map each source directory component to a sanitised folder name.
            let rel_source = path.strip_prefix(&source).unwrap_or(path);
            let mut target_rel = top_rel.clone();
            let components: Vec<String> =
                rel_source.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
            let dir_components =
                if entry.file_type().is_dir() { &components[..] } else { &components[..components.len() - 1] };
            let mut mapping_failed = false;
            for component in dir_components {
                match sanitize::folder_name(component) {
                    Ok(name) => target_rel = join_rel(&target_rel, &name),
                    Err(_) => {
                        mapping_failed = true;
                        break;
                    }
                }
            }
            if mapping_failed {
                report.failed.push(ImportIssue { source: display, reason: "Folder name can’t be used".into() });
                continue;
            }
            let target_dir = safe_path::resolve(&self.root, &target_rel)?;

            if entry.file_type().is_dir() {
                fs::create_dir_all(&target_dir).with_path("create folder", &target_dir)?;
            } else if entry.file_type().is_symlink() {
                report.skipped.push(ImportIssue { source: display, reason: "Symbolic links are not imported".into() });
            } else if !has_import_extension(path) {
                report.skipped.push(ImportIssue { source: display, reason: "Not a Markdown or text file".into() });
            } else {
                fs::create_dir_all(&target_dir).with_path("create folder", &target_dir)?;
                match self.import_one(path, &target_dir, &target_rel) {
                    Ok(note) => report.imported.push(note),
                    Err(err) => report.failed.push(ImportIssue { source: display, reason: err.to_string() }),
                }
            }
        }
        Ok(report)
    }

    fn import_one(&mut self, source: &Path, dir: &Path, folder_rel: &str) -> AppResult<ImportedNote> {
        let meta = fs::symlink_metadata(source).with_path("read", source)?;
        if meta.file_type().is_symlink() {
            return Err(AppError::invalid("Symbolic links are not imported"));
        }
        if !meta.is_file() {
            return Err(AppError::invalid("Not a regular file"));
        }
        if !has_import_extension(source) {
            return Err(AppError::invalid("Not a Markdown or text file"));
        }
        if meta.len() > MAX_IMPORT_FILE_BYTES {
            return Err(AppError::invalid("File is larger than 20 MB"));
        }
        let bytes = fs::read(source).with_path("read", source)?;
        let text = String::from_utf8(bytes).map_err(|_| AppError::invalid("Not valid UTF-8 text"))?;
        if text.contains('\0') {
            return Err(AppError::invalid("Looks like a binary file"));
        }

        let mut file = NoteFile::parse(&text);
        let meta = file.meta();
        let mut content = text.clone();
        // Keep ids unique: an imported copy of an existing note gets a new identity.
        if let Some(id) = &meta.id
            && self.contains_id(id)?
        {
            file.set(KEY_ID, Some(Scalar::str(uuid::Uuid::new_v4().to_string())));
            content = file.serialize();
        }

        let stem_source = source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let stem = note_file_stem(&stem_source);
        let mut attempts = 0;
        let name = loop {
            let taken = lowercase_names(dir);
            let name = unique_file_name(&stem, "md", |n| taken.contains(&n.to_lowercase()));
            match write_new_atomic(&dir.join(&name), content.as_bytes()) {
                Ok(()) => break name,
                Err(AppError::AlreadyExists(_)) if attempts < 5 => attempts += 1,
                Err(err) => return Err(err),
            }
        };
        let row = self.index_new_path(&join_rel(folder_rel, &name))?;
        Ok(ImportedNote { source: source.display().to_string(), id: row.summary.id, title: row.summary.title })
    }
}

//! Application error type shared by the storage layer and Tauri commands.
//!
//! Errors cross the IPC boundary as `{ kind, message }` so the frontend can
//! branch on `kind` (e.g. show a conflict dialog) without parsing messages.

use serde::Serialize;
use std::io;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    AlreadyExists(String),
    /// The file on disk changed since the editor loaded it.
    #[error("{0}")]
    Conflict(String),
    /// The note's file disappeared from disk (moved or deleted outside Linotes).
    #[error("{0}")]
    FileMissing(String),
    /// The library is not open (e.g. the notes folder is unavailable).
    #[error("{0}")]
    Unavailable(String),
    #[error("{message}")]
    Io { message: String },
    #[error("Index database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("{0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "notFound",
            AppError::InvalidInput(_) => "invalidInput",
            AppError::AlreadyExists(_) => "alreadyExists",
            AppError::Conflict(_) => "conflict",
            AppError::FileMissing(_) => "fileMissing",
            AppError::Unavailable(_) => "unavailable",
            AppError::Io { .. } => "io",
            AppError::Database(_) => "database",
            AppError::Internal(_) => "internal",
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        AppError::InvalidInput(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        AppError::NotFound(message.into())
    }
}

impl From<io::Error> for AppError {
    fn from(err: io::Error) -> Self {
        AppError::Io { message: err.to_string() }
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

/// Attach the action and path to I/O errors so messages are actionable.
pub trait IoContext<T> {
    fn with_path(self, action: &str, path: &Path) -> AppResult<T>;
}

impl<T> IoContext<T> for io::Result<T> {
    fn with_path(self, action: &str, path: &Path) -> AppResult<T> {
        self.map_err(|err| AppError::Io { message: format!("Could not {action} “{}”: {err}", path.display()) })
    }
}

//! XDG Base Directory locations used by Linotes.
//!
//! | Purpose  | Location                                   |
//! |----------|--------------------------------------------|
//! | Settings | `$XDG_CONFIG_HOME/linotes/settings.json`   |
//! | Index    | `$XDG_DATA_HOME/linotes/index/*.sqlite`    |
//! | Recovery | `$XDG_DATA_HOME/linotes/recovered/`        |
//! | Cache    | `$XDG_CACHE_HOME/linotes/`                 |
//! | Notes    | `$XDG_DOCUMENTS_DIR/Linotes` (default)     |
//!
//! Setting `LINOTES_PROFILE_DIR` redirects all of the above into one
//! directory, which is useful for development and automated tests.

use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

pub const APP_DIR_NAME: &str = "linotes";
pub const PROFILE_ENV: &str = "LINOTES_PROFILE_DIR";

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub default_notes_dir: PathBuf,
}

/// The user's Documents folder, also inside Snap and Flatpak sandboxes.
///
/// A Snap runs with a private `$HOME`, and both Snap and Flatpak redirect
/// `$XDG_CONFIG_HOME`, which hides `user-dirs.dirs` (where localised names like
/// `~/Belgeler` are defined). Notes belong in the real Documents folder, so the
/// real home and its `user-dirs.dirs` are consulted when available.
fn documents_dir() -> Option<PathBuf> {
    if let Some(real_home) = std::env::var_os("SNAP_REAL_HOME").map(PathBuf::from) {
        return Some(user_dir_from_config(&real_home, "DOCUMENTS").unwrap_or_else(|| real_home.join("Documents")));
    }
    if std::env::var_os("FLATPAK_ID").is_some()
        && let Some(home) = dirs::home_dir()
        && let Some(dir) = user_dir_from_config(&home, "DOCUMENTS")
    {
        return Some(dir);
    }
    dirs::document_dir().or_else(|| {
        let home = dirs::home_dir()?;
        Some(user_dir_from_config(&home, "DOCUMENTS").unwrap_or_else(|| home.join("Documents")))
    })
}

/// Read `XDG_<KEY>_DIR` from `<home>/.config/user-dirs.dirs`.
fn user_dir_from_config(home: &Path, key: &str) -> Option<PathBuf> {
    let text = std::fs::read_to_string(home.join(".config/user-dirs.dirs")).ok()?;
    let prefix = format!("XDG_{key}_DIR=");
    let value = text.lines().map(str::trim).find_map(|line| line.strip_prefix(&prefix))?;
    let value = value.trim().trim_matches('"');
    let path = match value.strip_prefix("$HOME") {
        Some(rest) => home.join(rest.trim_start_matches('/')),
        None if value.starts_with('/') => PathBuf::from(value),
        None => return None,
    };
    // A value of just "$HOME" means the feature is disabled; don't use the home folder itself.
    (path != home).then_some(path)
}

impl AppPaths {
    pub fn from_env() -> AppResult<Self> {
        if let Some(profile) = std::env::var_os(PROFILE_ENV).filter(|v| !v.is_empty()) {
            let base = PathBuf::from(profile);
            return Ok(Self::in_profile(base));
        }
        let missing = |what: &str| AppError::Internal(format!("Could not determine the {what} directory"));
        let config = dirs::config_dir().ok_or_else(|| missing("configuration"))?;
        let data = dirs::data_dir().ok_or_else(|| missing("data"))?;
        let cache = dirs::cache_dir().ok_or_else(|| missing("cache"))?;
        let documents = documents_dir().ok_or_else(|| missing("documents"))?;
        Ok(Self {
            config_dir: config.join(APP_DIR_NAME),
            data_dir: data.join(APP_DIR_NAME),
            cache_dir: cache.join(APP_DIR_NAME),
            default_notes_dir: documents.join("Linotes"),
        })
    }

    pub fn in_profile(base: PathBuf) -> Self {
        Self {
            config_dir: base.join("config"),
            data_dir: base.join("data"),
            cache_dir: base.join("cache"),
            default_notes_dir: base.join("notes"),
        }
    }

    pub fn settings_file(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }

    pub fn index_dir(&self) -> PathBuf {
        self.data_dir.join("index")
    }

    pub fn recovery_dir(&self) -> PathBuf {
        self.data_dir.join("recovered")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_localised_user_dirs() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join(".config")).unwrap();
        std::fs::write(
            home.path().join(".config/user-dirs.dirs"),
            "# comment\nXDG_DESKTOP_DIR=\"$HOME/Masaüstü\"\nXDG_DOCUMENTS_DIR=\"$HOME/Belgeler\"\n",
        )
        .unwrap();
        assert_eq!(user_dir_from_config(home.path(), "DOCUMENTS"), Some(home.path().join("Belgeler")));
        assert_eq!(user_dir_from_config(home.path(), "MUSIC"), None);
    }

    #[test]
    fn ignores_disabled_or_invalid_entries() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join(".config")).unwrap();
        std::fs::write(home.path().join(".config/user-dirs.dirs"), "XDG_DOCUMENTS_DIR=\"$HOME/\"\n").unwrap();
        assert_eq!(user_dir_from_config(home.path(), "DOCUMENTS"), None);
        std::fs::write(home.path().join(".config/user-dirs.dirs"), "XDG_DOCUMENTS_DIR=\"/srv/docs\"\n").unwrap();
        assert_eq!(user_dir_from_config(home.path(), "DOCUMENTS"), Some(PathBuf::from("/srv/docs")));
        assert_eq!(user_dir_from_config(Path::new("/nonexistent"), "DOCUMENTS"), None);
    }
}

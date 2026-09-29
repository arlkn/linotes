//! User preferences, stored as JSON in `$XDG_CONFIG_HOME/linotes/settings.json`.
//!
//! Unknown or invalid values fall back to defaults instead of failing, and a
//! file that cannot be parsed at all is backed up before being replaced.

use crate::error::{AppError, AppResult, IoContext};
use crate::filesystem::atomic::write_atomic;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EditorMode {
    #[default]
    Rich,
    Markdown,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortField {
    #[default]
    Modified,
    Created,
    Title,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    #[default]
    Desc,
    Asc,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowGeometry {
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self { width: 1200, height: 780, maximized: false }
    }
}

pub const ACCENTS: &[&str] =
    &["orange", "bark", "sage", "olive", "viridian", "prussian", "blue", "purple", "magenta", "red"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: ThemePreference,
    pub accent: String,
    /// Editor text size in pixels.
    pub editor_font_size: u8,
    /// Interface zoom in percent (Ctrl+Plus / Ctrl+Minus).
    pub ui_zoom: u16,
    pub default_editor_mode: EditorMode,
    pub spellcheck: bool,
    /// Save automatically while typing (notes are always saved when switching or closing).
    pub autosave: bool,
    /// Custom notes folder; `None` means the default (`~/Documents/Linotes`).
    pub notes_dir: Option<String>,
    pub sort_field: SortField,
    pub sort_direction: SortDirection,
    pub sidebar_width: u16,
    pub list_width: u16,
    pub sidebar_collapsed: bool,
    pub window: WindowGeometry,
    pub last_note_id: Option<String>,
    /// Whether the first-run welcome note has been offered.
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: ThemePreference::System,
            accent: "orange".into(),
            editor_font_size: 16,
            ui_zoom: 100,
            default_editor_mode: EditorMode::Rich,
            spellcheck: true,
            autosave: true,
            notes_dir: None,
            sort_field: SortField::Modified,
            sort_direction: SortDirection::Desc,
            sidebar_width: 232,
            list_width: 320,
            sidebar_collapsed: false,
            window: WindowGeometry::default(),
            last_note_id: None,
            onboarded: false,
        }
    }
}

impl Settings {
    /// Clamp numbers and replace unknown enum values with defaults.
    pub fn sanitized(mut self) -> Self {
        let d = Settings::default();
        if self.theme == ThemePreference::Unknown {
            self.theme = d.theme;
        }
        if self.default_editor_mode == EditorMode::Unknown {
            self.default_editor_mode = d.default_editor_mode;
        }
        if self.sort_field == SortField::Unknown {
            self.sort_field = d.sort_field;
        }
        if self.sort_direction == SortDirection::Unknown {
            self.sort_direction = d.sort_direction;
        }
        if !ACCENTS.contains(&self.accent.as_str()) {
            self.accent = d.accent;
        }
        self.editor_font_size = self.editor_font_size.clamp(12, 28);
        self.ui_zoom = self.ui_zoom.clamp(70, 160);
        self.sidebar_width = self.sidebar_width.clamp(180, 400);
        self.list_width = self.list_width.clamp(240, 560);
        self.window.width = self.window.width.clamp(640, 10_000);
        self.window.height = self.window.height.clamp(480, 10_000);
        if self.notes_dir.as_deref().is_some_and(|d| d.trim().is_empty() || !Path::new(d).is_absolute()) {
            self.notes_dir = None;
        }
        if self.last_note_id.as_deref().is_some_and(|id| !crate::storage::note_file::is_valid_id(id)) {
            self.last_note_id = None;
        }
        self
    }

    pub fn load(path: &Path) -> Settings {
        let text = match std::fs::read_to_string(path) {
            Ok(text) => text,
            Err(_) => return Settings::default(),
        };
        match serde_json::from_str::<Settings>(&text) {
            Ok(settings) => settings.sanitized(),
            Err(err) => {
                log::warn!("Settings file is invalid ({err}); keeping a backup and using defaults");
                let backup = path.with_extension(format!("json.invalid-{}", chrono::Utc::now().format("%Y%m%d%H%M%S")));
                let _ = std::fs::rename(path, backup);
                Settings::default()
            }
        }
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).with_path("create", parent)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| AppError::Internal(e.to_string()))?;
        write_atomic(path, format!("{json}\n").as_bytes())
    }

    /// Apply a partial update from the frontend. `notesDir` and `window` cannot be
    /// changed this way: the notes folder only changes through a native folder
    /// picker, and window geometry is tracked by the backend.
    pub fn apply_patch(&self, patch: serde_json::Value) -> AppResult<Settings> {
        let serde_json::Value::Object(patch) = patch else {
            return Err(AppError::invalid("Settings update must be an object"));
        };
        let mut current = serde_json::to_value(self).map_err(|e| AppError::Internal(e.to_string()))?;
        let object = current.as_object_mut().expect("settings serialize to an object");
        for (key, value) in patch {
            if key == "notesDir" || key == "window" {
                return Err(AppError::invalid(format!("“{key}” can’t be changed this way")));
            }
            if !object.contains_key(&key) {
                return Err(AppError::invalid(format!("Unknown setting “{key}”")));
            }
            object.insert(key, value);
        }
        let updated: Settings =
            serde_json::from_value(current).map_err(|e| AppError::invalid(format!("Invalid setting value: {e}")))?;
        Ok(updated.sanitized())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/settings.json");
        let settings = Settings { theme: ThemePreference::Dark, accent: "blue".into(), ..Default::default() };
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path), settings);
    }

    #[test]
    fn theme_preference_persists_across_restarts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        for theme in [ThemePreference::Light, ThemePreference::Dark, ThemePreference::System] {
            let updated = Settings::load(&path).apply_patch(json!({ "theme": theme })).unwrap();
            updated.save(&path).unwrap();
            assert_eq!(Settings::load(&path).theme, theme);
        }
    }

    #[test]
    fn missing_file_gives_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(Settings::load(&dir.path().join("none.json")), Settings::default());
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        assert!(!path.exists());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1, "backup is kept");
    }

    #[test]
    fn invalid_values_are_sanitized() {
        let settings: Settings = serde_json::from_value(json!({
            "theme": "neon",
            "accent": "#ff00ff",
            "editorFontSize": 200,
            "uiZoom": 5,
            "notesDir": "relative/path",
            "unknownKey": true
        }))
        .unwrap();
        let settings = settings.sanitized();
        assert_eq!(settings.theme, ThemePreference::System);
        assert_eq!(settings.accent, "orange");
        assert_eq!(settings.editor_font_size, 28);
        assert_eq!(settings.ui_zoom, 70);
        assert_eq!(settings.notes_dir, None);
    }

    #[test]
    fn patches_are_restricted() {
        let base = Settings::default();
        let updated = base.apply_patch(json!({ "spellcheck": false, "editorFontSize": 18 })).unwrap();
        assert!(!updated.spellcheck);
        assert_eq!(updated.editor_font_size, 18);
        assert!(base.apply_patch(json!({ "notesDir": "/etc" })).is_err());
        assert!(base.apply_patch(json!({ "bogus": 1 })).is_err());
        assert!(base.apply_patch(json!({ "spellcheck": "yes" })).is_err());
        assert!(base.apply_patch(json!([1, 2])).is_err());
    }
}

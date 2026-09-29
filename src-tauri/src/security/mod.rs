//! Validation for operations that reach outside the app.

use crate::error::{AppError, AppResult};
use std::path::Path;

pub const MAX_URL_LEN: usize = 2048;
const ALLOWED_SCHEMES: &[&str] = &["http://", "https://", "mailto:"];

/// Only web and mail links may be handed to the system opener. `file:`,
/// `javascript:`, custom schemes and anything with control characters are refused.
pub fn validate_external_url(url: &str) -> AppResult<()> {
    if url.len() > MAX_URL_LEN || url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AppError::invalid("This link can’t be opened."));
    }
    let lower = url.to_ascii_lowercase();
    let scheme = ALLOWED_SCHEMES.iter().find(|s| lower.starts_with(**s));
    match scheme {
        Some(&"mailto:") if url.len() > "mailto:".len() => Ok(()),
        Some(s) if url.len() > s.len() && !lower[s.len()..].starts_with('/') => Ok(()),
        _ => Err(AppError::invalid("Only web (http/https) and email links can be opened.")),
    }
}

/// Whether the webview may navigate to `url`: only the app's own pages (and,
/// in development builds, the dev server). Everything else is blocked, so the
/// window can never load remote content — even from a dropped link.
pub fn is_app_url(url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return true;
    }
    dev_url.is_some_and(|dev| {
        url.scheme() == dev.scheme()
            && url.host_str() == dev.host_str()
            && url.port_or_known_default() == dev.port_or_known_default()
    })
}

/// Folders that must never become the notes folder: they are either far too
/// broad to index or belong to the operating system.
pub fn validate_notes_dir(path: &Path, home: Option<&Path>, app_dirs: &[&Path]) -> AppResult<()> {
    if !path.is_absolute() {
        return Err(AppError::invalid("Choose an absolute folder path."));
    }
    if path == Path::new("/") || home.is_some_and(|h| path == h) {
        return Err(AppError::invalid(
            "That folder is too broad to use for notes. Choose or create a dedicated folder, such as ~/Documents/Linotes.",
        ));
    }
    const SYSTEM: &[&str] =
        &["/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/run", "/sbin", "/sys", "/usr", "/var"];
    if SYSTEM.iter().any(|s| path.starts_with(s)) {
        return Err(AppError::invalid("System folders can’t be used for notes."));
    }
    if app_dirs.iter().any(|d| path.starts_with(d) || d.starts_with(path)) {
        return Err(AppError::invalid("Linotes’ own configuration and data folders can’t be used for notes."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_web_and_mail_links() {
        for ok in [
            "https://example.com",
            "http://localhost:3000/x?y=1#z",
            "mailto:someone@example.com",
            "HTTPS://EXAMPLE.COM",
        ] {
            assert!(validate_external_url(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn refuses_dangerous_links() {
        for bad in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "vbscript:x",
            "smb://server/share",
            "https://",
            "https:///path",
            "https://exa mple.com",
            "https://example.com/\n",
            "mailto:",
            "",
            "/relative/path",
            "Other note.md",
        ] {
            assert!(validate_external_url(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn only_app_pages_may_load() {
        let url = |s: &str| tauri::Url::parse(s).unwrap();
        let dev = url("http://localhost:1420/");
        assert!(is_app_url(&url("tauri://localhost/index.html"), None));
        assert!(is_app_url(&url("http://tauri.localhost/"), None));
        assert!(is_app_url(&url("http://localhost:1420/src/main.tsx"), Some(&dev)));
        assert!(!is_app_url(&url("http://localhost:1420/"), None), "dev server is not allowed in release");
        assert!(!is_app_url(&url("http://localhost:8080/"), Some(&dev)));
        assert!(!is_app_url(&url("https://example.com/"), Some(&dev)));
        assert!(!is_app_url(&url("file:///etc/passwd"), Some(&dev)));
        assert!(!is_app_url(&url("https://tauri.localhost.evil.com/"), None));
    }

    #[test]
    fn refuses_broad_or_system_notes_folders() {
        let home = Path::new("/home/user");
        let data = Path::new("/home/user/.local/share/linotes");
        assert!(validate_notes_dir(Path::new("/home/user/Documents/Linotes"), Some(home), &[data]).is_ok());
        assert!(validate_notes_dir(Path::new("/media/usb/notes"), Some(home), &[data]).is_ok());
        for bad in ["/", "/home/user", "/etc/notes", "/usr/share", "/home/user/.local/share/linotes/index", "relative"]
        {
            assert!(validate_notes_dir(Path::new(bad), Some(home), &[data]).is_err(), "{bad} should be refused");
        }
    }
}

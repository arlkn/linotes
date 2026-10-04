//! The `linotes-image:` protocol: how the web view shows images from the notes folder.
//!
//! The page loads `linotes-image://localhost/<library-relative path>`. Only
//! image files inside the notes folder are served (see `storage::read_image`);
//! everything else is answered with 404. The web view still has no other way
//! to read files.

use crate::state::{AppState, lock};
use crate::storage::{percent_decode, read_image};
use std::path::{Path, PathBuf};
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{AppHandle, Manager};

pub const SCHEME: &str = "linotes-image";

pub fn respond(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    image_response(notes_folder(app).as_deref(), request.uri().path())
}

/// The open notes folder, without waiting for the library (a long sync may hold it).
fn notes_folder(app: &AppHandle) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    let status = lock(&state.status);
    status.ready.then(|| PathBuf::from(&status.root))
}

/// The answer to a request for `path` (`/attachments%2Fa.png`) with the notes folder at `root`.
fn image_response(root: Option<&Path>, path: &str) -> Response<Vec<u8>> {
    let rel = percent_decode(path.trim_start_matches('/'));
    let Some(root) = root else { return not_found() };
    match read_image(root, &rel) {
        Ok((kind, bytes)) => {
            let mut response = Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, kind.mime())
                .header(header::CACHE_CONTROL, "no-cache")
                .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff");
            if kind.mime() == "image/svg+xml" {
                // SVG can carry scripts; they must never run.
                response = response
                    .header(header::CONTENT_SECURITY_POLICY, "default-src 'none'; style-src 'unsafe-inline'; sandbox");
            }
            response.body(bytes).unwrap_or_else(|_| not_found())
        }
        Err(err) => {
            log::debug!("Image not shown ({rel}): {err}");
            not_found()
        }
    }
}

fn not_found() -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = StatusCode::NOT_FOUND;
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    #[test]
    fn serves_images_from_the_notes_folder_only() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::create_dir(root.join("attachments")).unwrap();
        fs::write(root.join("attachments/my photo.png"), PNG).unwrap();
        fs::write(root.join("attachments/icon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>").unwrap();

        let png = image_response(Some(&root), "/attachments%2Fmy%20photo.png");
        assert_eq!(png.status(), StatusCode::OK);
        assert_eq!(png.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(png.headers()[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(png.body(), PNG);

        let svg = image_response(Some(&root), "/attachments%2Ficon.svg");
        assert_eq!(svg.headers()[header::CONTENT_TYPE], "image/svg+xml");
        assert!(svg.headers()[header::CONTENT_SECURITY_POLICY].to_str().unwrap().contains("sandbox"));

        for path in ["/attachments%2F..%2F..%2Fetc%2Fpasswd", "/%2Fetc%2Fpasswd", "/attachments%2Fmissing.png", "/"] {
            assert_eq!(image_response(Some(&root), path).status(), StatusCode::NOT_FOUND, "{path}");
        }
        assert_eq!(image_response(None, "/attachments%2Fmy%20photo.png").status(), StatusCode::NOT_FOUND);
    }
}

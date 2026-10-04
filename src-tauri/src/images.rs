//! The `linotes-image:` protocol: how the web view shows images from the notes folder.
//!
//! The page loads `linotes-image://localhost/<library-relative path>`. Only
//! image files inside the notes folder are served (see `storage::read_image`);
//! everything else is answered with 404. The web view still has no other way
//! to read files.

use crate::state::{AppState, lock};
use crate::storage::{percent_decode, read_image};
use std::path::PathBuf;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{AppHandle, Manager};

pub const SCHEME: &str = "linotes-image";

pub fn respond(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let rel = percent_decode(request.uri().path().trim_start_matches('/'));
    let Some(root) = notes_folder(app) else { return not_found() };
    match read_image(&root, &rel) {
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

/// The open notes folder, without waiting for the library (a long sync may hold it).
fn notes_folder(app: &AppHandle) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    let status = lock(&state.status);
    status.ready.then(|| PathBuf::from(&status.root))
}

fn not_found() -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = StatusCode::NOT_FOUND;
    response
}

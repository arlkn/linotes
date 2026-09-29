//! Importing Markdown into the library and exporting notes out of it.
//!
//! Paths for these operations always come from native file dialogs opened by
//! the Rust side (see `commands::import_export`), never from the webview.

mod export;
mod import;

pub use export::ExportReport;
pub use import::ImportReport;

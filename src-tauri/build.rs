// Every IPC command must be listed here. Tauri then generates one permission
// per command (`allow-<command>`), and `capabilities/default.json` grants them
// explicitly — a command that is not granted cannot be called from the webview.
const COMMANDS: &[&str] = &[
    "list_notes",
    "read_note",
    "create_note",
    "save_note",
    "set_favorite",
    "move_note",
    "trash_note",
    "restore_note",
    "delete_note_permanently",
    "empty_trash",
    "list_folders",
    "create_folder",
    "rename_folder",
    "delete_folder",
    "search_notes",
    "get_settings",
    "update_settings",
    "get_library_status",
    "choose_notes_directory",
    "use_default_notes_directory",
    "retry_open_library",
    "open_notes_folder",
    "reveal_note_file",
    "rebuild_index",
    "import_files",
    "import_folder",
    "export_note",
    "export_zip",
    "app_ready",
    "get_app_info",
    "open_external_url",
    "confirm_close",
    "cancel_close",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}

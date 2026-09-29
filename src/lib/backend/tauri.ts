import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Backend } from './types';
import { toBackendError } from './errors';
import type { SyncReport } from '@/types/domain';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toBackendError(error);
  }
}

/** Backend implementation that talks to the Rust side over Tauri IPC. */
export function createTauriBackend(): Backend {
  return {
    kind: 'tauri',

    listNotes: () => call('list_notes'),
    readNote: (id) => call('read_note', { id }),
    createNote: (folder, title) => call('create_note', { folder, title: title ?? null }),
    saveNote: (input) => call('save_note', { input }),
    setFavorite: (id, favorite) => call('set_favorite', { id, favorite }),
    moveNote: (id, folder) => call('move_note', { id, folder }),
    trashNote: (id) => call('trash_note', { id }),
    restoreNote: (id) => call('restore_note', { id }),
    deleteNotePermanently: (id) => call('delete_note_permanently', { id }),
    emptyTrash: () => call('empty_trash'),

    listFolders: () => call('list_folders'),
    createFolder: (parent, name) => call('create_folder', { parent, name }),
    renameFolder: (path, newName) => call('rename_folder', { path, newName }),
    deleteFolder: (path) => call('delete_folder', { path }),

    searchNotes: (query) => call('search_notes', { query }),

    getSettings: () => call('get_settings'),
    updateSettings: (patch) => call('update_settings', { patch }),

    getLibraryStatus: () => call('get_library_status'),
    chooseNotesDirectory: () => call('choose_notes_directory'),
    useDefaultNotesDirectory: () => call('use_default_notes_directory'),
    retryOpenLibrary: () => call('retry_open_library'),
    openNotesFolder: () => call('open_notes_folder'),
    revealNoteFile: (id) => call('reveal_note_file', { id }),
    rebuildIndex: () => call('rebuild_index'),

    importFiles: (targetFolder) => call('import_files', { targetFolder }),
    importFolder: (targetFolder) => call('import_folder', { targetFolder }),
    exportNote: (id) => call('export_note', { id }),
    exportZip: (folder) => call('export_zip', { folder }),

    appReady: () => call('app_ready'),
    getAppInfo: () => call('get_app_info'),
    openExternalUrl: (url) => call('open_external_url', { url }),
    applyWindowTheme: (preference, fallback) => call('apply_window_theme', { preference, fallback }),
    confirmClose: () => call('confirm_close'),
    cancelClose: () => call('cancel_close'),

    onLibraryChanged: (handler) => listen<SyncReport>('library-changed', (event) => handler(event.payload)),
    onCloseRequested: (handler) => listen('app-close-requested', () => handler()),
  };
}

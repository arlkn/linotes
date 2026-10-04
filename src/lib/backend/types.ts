import type {
  AppInfo,
  DeleteFolderReport,
  ExportReport,
  FolderInfo,
  ImportReport,
  LibraryStatus,
  Note,
  NoteSummary,
  SaveNoteInput,
  SavedImage,
  SavedNote,
  SearchHit,
  SearchQuery,
  Settings,
  SettingsPatch,
  SyncReport,
  ThemePreference,
} from '@/types/domain';

export type Unlisten = () => void;

/**
 * Everything the UI can ask of the backend. The Tauri implementation calls
 * Rust commands; the in-memory implementation powers the browser preview and
 * unit tests. Methods that open native dialogs resolve to `null` when the
 * user cancels.
 */
export interface Backend {
  readonly kind: 'tauri' | 'memory';

  listNotes(): Promise<NoteSummary[]>;
  readNote(id: string): Promise<Note>;
  createNote(folder: string, title?: string): Promise<Note>;
  saveNote(input: SaveNoteInput): Promise<SavedNote>;
  setFavorite(id: string, favorite: boolean): Promise<NoteSummary>;
  moveNote(id: string, folder: string): Promise<NoteSummary>;
  trashNote(id: string): Promise<NoteSummary>;
  restoreNote(id: string): Promise<NoteSummary>;
  deleteNotePermanently(id: string): Promise<void>;
  emptyTrash(): Promise<number>;

  listFolders(): Promise<FolderInfo[]>;
  createFolder(parent: string, name: string): Promise<FolderInfo>;
  renameFolder(path: string, newName: string): Promise<FolderInfo>;
  deleteFolder(path: string): Promise<DeleteFolderReport>;

  searchNotes(query: SearchQuery): Promise<SearchHit[]>;

  /** Store an image (pasted or dropped) for a note. */
  saveImage(noteId: string, name: string, bytes: Uint8Array): Promise<SavedImage>;
  /** Pick an image with the file chooser and store it for a note. */
  chooseImage(noteId: string): Promise<SavedImage | null>;
  /** URL the page can show the image at the library-relative `path` with. */
  imageUrl(path: string): string;

  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;

  getLibraryStatus(): Promise<LibraryStatus>;
  chooseNotesDirectory(): Promise<LibraryStatus | null>;
  useDefaultNotesDirectory(): Promise<LibraryStatus>;
  retryOpenLibrary(): Promise<LibraryStatus>;
  openNotesFolder(): Promise<void>;
  revealNoteFile(id: string): Promise<void>;
  rebuildIndex(): Promise<SyncReport>;

  importFiles(targetFolder: string): Promise<ImportReport | null>;
  importFolder(targetFolder: string): Promise<ImportReport | null>;
  exportNote(id: string): Promise<ExportReport | null>;
  exportZip(folder: string | null): Promise<ExportReport | null>;

  appReady(): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  openExternalUrl(url: string): Promise<void>;
  /**
   * Match the window frame (title bar) to the theme and return the theme to show.
   * For `system` the desktop's own preference wins; `fallback` is used without one.
   */
  applyWindowTheme(preference: ThemePreference, fallback: 'light' | 'dark'): Promise<'light' | 'dark'>;
  confirmClose(): Promise<void>;
  cancelClose(): Promise<void>;

  /** Files changed outside Linotes and the index was updated. */
  onLibraryChanged(handler: (report: SyncReport) => void): Promise<Unlisten>;
  /** The user asked to close the window; save, then call `confirmClose`. */
  onCloseRequested(handler: () => void): Promise<Unlisten>;
}

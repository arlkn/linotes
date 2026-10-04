/**
 * Types shared with the Rust backend. These mirror the serde structs in
 * `src-tauri/src` (camelCase field names) and must be kept in sync with them.
 */

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  /** Library-relative folder path ("" = top level). For trashed notes: the folder it came from. */
  folder: string;
  favorite: boolean;
  trashed: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note extends NoteSummary {
  /** Markdown body (without frontmatter). */
  content: string;
  /** Revision token; sent back when saving to detect outside changes. */
  rev: string;
  /** Absolute path of the Markdown file. */
  path: string;
}

export interface SaveNoteInput {
  id: string;
  title: string;
  content: string;
  expectedRev: string;
  force?: boolean;
}

export interface SavedNote {
  summary: NoteSummary;
  rev: string;
  path: string;
}

/** An image stored for a note (in `attachments/`). */
export interface SavedImage {
  /** The link to put in the note, relative to the note's folder. */
  link: string;
  /** Library-relative path of the image file. */
  path: string;
}

export interface FolderInfo {
  path: string;
  name: string;
  parent: string;
  noteCount: number;
}

export interface DeleteFolderReport {
  trashedNotes: number;
  removed: boolean;
  remainingFiles: string[];
}

export type SearchScope = 'all' | 'favorites' | 'folder' | 'trash';

export interface SearchQuery {
  text: string;
  scope: SearchScope;
  folder?: string | null;
}

export interface SearchHit {
  note: NoteSummary;
  /** Title with matches wrapped in U+0002 … U+0003. */
  titleHighlight: string;
  /** Body excerpt with matches wrapped in U+0002 … U+0003. */
  snippet: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface SyncReport {
  added: string[];
  updated: string[];
  removed: string[];
  skipped: SkippedFile[];
}

export interface RecoveredFile {
  original: string;
  savedTo: string;
  action: 'restored' | 'preserved';
}

export interface LibraryStatus {
  root: string;
  isDefault: boolean;
  ready: boolean;
  error: string | null;
  recovered: RecoveredFile[];
  skipped: SkippedFile[];
  rebuiltIndex: string | null;
  watcherError: string | null;
}

export interface ImportIssue {
  source: string;
  reason: string;
}

export interface ImportReport {
  imported: { source: string; id: string; title: string }[];
  failed: ImportIssue[];
  skipped: ImportIssue[];
  folder: string | null;
}

export interface ExportReport {
  files: number;
  destination: string;
}

export interface AppInfo {
  name: string;
  version: string;
  license: string;
  tauriVersion: string;
  configDir: string;
  dataDir: string;
  notesDir: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type EditorMode = 'rich' | 'markdown';
export type SortField = 'modified' | 'created' | 'title';
export type SortDirection = 'asc' | 'desc';

export const ACCENTS = [
  'orange',
  'bark',
  'sage',
  'olive',
  'viridian',
  'prussian',
  'blue',
  'purple',
  'magenta',
  'red',
] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Settings {
  theme: ThemePreference;
  accent: Accent;
  editorFontSize: number;
  uiZoom: number;
  defaultEditorMode: EditorMode;
  spellcheck: boolean;
  autosave: boolean;
  notesDir: string | null;
  sortField: SortField;
  sortDirection: SortDirection;
  sidebarWidth: number;
  listWidth: number;
  sidebarCollapsed: boolean;
  window: { width: number; height: number; maximized: boolean };
  lastNoteId: string | null;
  onboarded: boolean;
}

/** Settings the frontend may change (notes folder and window size are backend-managed). */
export type SettingsPatch = Partial<Omit<Settings, 'notesDir' | 'window'>>;

export type ErrorKind =
  | 'notFound'
  | 'invalidInput'
  | 'alreadyExists'
  | 'conflict'
  | 'fileMissing'
  | 'unavailable'
  | 'io'
  | 'database'
  | 'internal';

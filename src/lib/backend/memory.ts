/**
 * In-memory backend used for the browser preview (`npm run dev` outside
 * Tauri) and for unit tests. It mirrors the Rust behaviour closely enough to
 * exercise the UI, but it does not touch the filesystem: nothing is saved.
 */
import type { Backend } from './types';
import { BackendError } from './errors';
import { fold } from '@/lib/fold';
import { WELCOME_NOTE_BODY, WELCOME_NOTE_TITLE } from '@/features/onboarding/welcome';
import type {
  FolderInfo,
  LibraryStatus,
  Note,
  NoteSummary,
  SearchHit,
  Settings,
  SyncReport,
} from '@/types/domain';

const HL_START = '\u0002';
const HL_END = '\u0003';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'orange',
  editorFontSize: 16,
  uiZoom: 100,
  defaultEditorMode: 'rich',
  spellcheck: true,
  autosave: true,
  notesDir: null,
  sortField: 'modified',
  sortDirection: 'desc',
  sidebarWidth: 232,
  listWidth: 320,
  sidebarCollapsed: false,
  window: { width: 1200, height: 780, maximized: false },
  lastNoteId: null,
  onboarded: false,
};

interface StoredNote extends NoteSummary {
  content: string;
  rev: number;
}

export interface MemoryBackendOptions {
  /** Populate with example notes (browser preview). */
  seed?: boolean;
  /** Add this many generated notes, spread over 50 folders (performance testing). */
  generatedNotes?: number;
  settings?: Partial<Settings>;
}

export interface MemoryBackend extends Backend {
  /** Simulate an edit made by another program (tests). */
  simulateExternalEdit(id: string, content: string): void;
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function plain(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n/g, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\\*_`~]/g, '')
    .replace(/[#>[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function highlight(text: string, words: string[]): string {
  let out = text;
  for (const word of words) {
    const index = fold(out).indexOf(word);
    if (index >= 0 && fold(out).length === out.length) {
      out =
        out.slice(0, index) +
        HL_START +
        out.slice(index, index + word.length) +
        HL_END +
        out.slice(index + word.length);
    }
  }
  return out;
}

function validateFolder(path: string): void {
  if (path === '') return;
  if (
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.split('/').some((p) => !p || p === '..' || p.startsWith('.'))
  ) {
    throw new BackendError('invalidInput', 'Invalid folder path');
  }
}

function cleanName(name: string): string {
  return name
    .replace(/[/\\:]/g, '-')
    .replace(/[*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
}

export function createMemoryBackend(options: MemoryBackendOptions = {}): MemoryBackend {
  const notes = new Map<string, StoredNote>();
  const folders = new Set<string>();
  let settings: Settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const changeHandlers = new Set<(report: SyncReport) => void>();
  let counter = 0;

  const status: LibraryStatus = {
    root: '/preview/Linotes',
    isDefault: true,
    ready: true,
    error: null,
    recovered: [],
    skipped: [],
    rebuiltIndex: null,
    watcherError: null,
  };

  const summary = (note: StoredNote): NoteSummary => ({
    id: note.id,
    title: note.title,
    preview: plain(note.content).slice(0, 180),
    folder: note.folder,
    favorite: note.favorite,
    trashed: note.trashed,
    trashedAt: note.trashedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });

  const toNote = (note: StoredNote): Note => ({
    ...summary(note),
    content: note.content,
    rev: String(note.rev),
    path: `${status.root}/${note.folder ? `${note.folder}/` : ''}${note.title || 'Untitled'}.md`,
  });

  const get = (id: string): StoredNote => {
    const note = notes.get(id);
    if (!note) throw new BackendError('notFound', 'That note no longer exists.');
    return note;
  };

  const addNote = (
    folder: string,
    title: string,
    content: string,
    extra: Partial<StoredNote> = {},
  ): StoredNote => {
    counter += 1;
    const timestamp = now();
    const note: StoredNote = {
      id: `mem-${counter}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      preview: '',
      folder,
      favorite: false,
      trashed: false,
      trashedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      content,
      rev: 1,
      ...extra,
    };
    notes.set(note.id, note);
    return note;
  };

  if (options.seed) {
    const ago = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    ['Work', 'Work/Projects', 'Personal', 'Recipes'].forEach((f) => folders.add(f));
    addNote('', WELCOME_NOTE_TITLE, WELCOME_NOTE_BODY, {
      favorite: true,
      updatedAt: ago(2),
      createdAt: ago(2),
    });
    addNote(
      'Work',
      'Weekly planning',
      '## Goals\n\n- [x] Ship the search index\n- [ ] Review import flow\n- [ ] Write release notes\n\n> Keep the scope small.\n',
      { updatedAt: ago(35), createdAt: ago(3000) },
    );
    addNote(
      'Work/Projects',
      'Linotes architecture',
      'Markdown files are the **source of truth**. SQLite is only an index.\n\n```rust\nfn main() {\n    println!("Hello, Linux!");\n}\n```\n',
      { updatedAt: ago(240), createdAt: ago(9000), favorite: true },
    );
    addNote(
      'Personal',
      'Reading list',
      '1. *The Pragmatic Programmer*\n2. *Designing Data-Intensive Applications*\n',
      {
        updatedAt: ago(60 * 26),
        createdAt: ago(60 * 80),
      },
    );
    addNote('Recipes', 'Menemen', 'Tomatoes, peppers, eggs, and a pinch of **pul biber**.\n', {
      updatedAt: ago(60 * 24 * 9),
      createdAt: ago(60 * 24 * 30),
    });
    addNote('', 'Old draft', 'Something I no longer need.\n', {
      trashed: true,
      trashedAt: ago(60),
      updatedAt: ago(60 * 24 * 40),
      createdAt: ago(60 * 24 * 40),
    });
    settings = { ...settings, onboarded: true };
  }

  for (let i = 0; i < (options.generatedNotes ?? 0); i += 1) {
    const folder = `Generated ${i % 50}`;
    const time = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    folders.add(folder);
    addNote(folder, `Generated note ${i}`, `Some **Markdown** text for note ${i}.\n`, {
      updatedAt: time,
      createdAt: time,
    });
  }

  const folderCounts = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const note of notes.values()) {
      if (!note.trashed) counts.set(note.folder, (counts.get(note.folder) ?? 0) + 1);
    }
    return counts;
  };

  const folderInfo = (path: string): FolderInfo => {
    const slash = path.lastIndexOf('/');
    return {
      path,
      name: slash >= 0 ? path.slice(slash + 1) : path,
      parent: slash >= 0 ? path.slice(0, slash) : '',
      noteCount: folderCounts().get(path) ?? 0,
    };
  };

  const requireFolder = (path: string) => {
    validateFolder(path);
    if (path !== '' && !folders.has(path))
      throw new BackendError('notFound', `Folder “${path}” does not exist`);
  };

  const backend: MemoryBackend = {
    kind: 'memory',

    async listNotes() {
      return [...notes.values()].map(summary);
    },
    async readNote(id) {
      return toNote(get(id));
    },
    async createNote(folder, title = '') {
      requireFolder(folder);
      return toNote(addNote(folder, title.trim(), ''));
    },
    async saveNote(input) {
      const note = get(input.id);
      if (note.trashed) throw new BackendError('invalidInput', 'Notes in the trash can’t be edited.');
      if (!input.force && String(note.rev) !== input.expectedRev) {
        throw new BackendError('conflict', `“${note.title || 'Untitled'}” was changed outside Linotes.`);
      }
      note.title = input.title.trim();
      note.content = input.content.replace(/\n*$/, input.content.trim() ? '\n' : '');
      note.rev += 1;
      note.updatedAt = now();
      const saved = toNote(note);
      return { summary: summary(note), rev: saved.rev, path: saved.path };
    },
    async setFavorite(id, favorite) {
      const note = get(id);
      note.favorite = favorite;
      return summary(note);
    },
    async moveNote(id, folder) {
      requireFolder(folder);
      const note = get(id);
      if (note.trashed)
        throw new BackendError('invalidInput', 'Restore the note from the trash before moving it.');
      note.folder = folder;
      return summary(note);
    },
    async trashNote(id) {
      const note = get(id);
      note.trashed = true;
      note.trashedAt = now();
      return summary(note);
    },
    async restoreNote(id) {
      const note = get(id);
      note.trashed = false;
      note.trashedAt = null;
      if (note.folder) {
        const parts = note.folder.split('/');
        parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join('/')));
      }
      return summary(note);
    },
    async deleteNotePermanently(id) {
      const note = get(id);
      if (!note.trashed)
        throw new BackendError('invalidInput', 'Only notes in the trash can be deleted permanently.');
      notes.delete(id);
    },
    async emptyTrash() {
      let count = 0;
      for (const [id, note] of notes) {
        if (note.trashed) {
          notes.delete(id);
          count += 1;
        }
      }
      return count;
    },

    async listFolders() {
      return [...folders].sort((a, b) => a.localeCompare(b)).map(folderInfo);
    },
    async createFolder(parent, name) {
      requireFolder(parent);
      const clean = cleanName(name);
      if (!clean) throw new BackendError('invalidInput', 'Folder name cannot be empty');
      const path = parent ? `${parent}/${clean}` : clean;
      if ([...folders].some((f) => f.toLowerCase() === path.toLowerCase())) {
        throw new BackendError('alreadyExists', `A folder or file named “${clean}” already exists here.`);
      }
      folders.add(path);
      return folderInfo(path);
    },
    async renameFolder(path, newName) {
      requireFolder(path);
      const clean = cleanName(newName);
      if (!clean) throw new BackendError('invalidInput', 'Folder name cannot be empty');
      const parent = folderInfo(path).parent;
      const next = parent ? `${parent}/${clean}` : clean;
      if (next !== path && [...folders].some((f) => f.toLowerCase() === next.toLowerCase() && f !== path)) {
        throw new BackendError('alreadyExists', `A folder or file named “${clean}” already exists here.`);
      }
      const swap = (value: string) =>
        value === path ? next : value.startsWith(`${path}/`) ? next + value.slice(path.length) : value;
      for (const f of [...folders]) {
        folders.delete(f);
        folders.add(swap(f));
      }
      for (const note of notes.values()) note.folder = swap(note.folder);
      return folderInfo(next);
    },
    async deleteFolder(path) {
      requireFolder(path);
      let trashedNotes = 0;
      for (const note of notes.values()) {
        if (!note.trashed && (note.folder === path || note.folder.startsWith(`${path}/`))) {
          note.trashed = true;
          note.trashedAt = now();
          trashedNotes += 1;
        }
      }
      for (const f of [...folders]) if (f === path || f.startsWith(`${path}/`)) folders.delete(f);
      return { trashedNotes, removed: true, remainingFiles: [] };
    },

    async searchNotes(query) {
      const words = fold(query.text)
        .split(/\s+/)
        .filter((w) => /[\p{L}\p{N}]/u.test(w));
      if (words.length === 0) return [];
      const hits: SearchHit[] = [];
      for (const note of notes.values()) {
        const inScope =
          query.scope === 'trash'
            ? note.trashed
            : !note.trashed &&
              (query.scope === 'all' ||
                (query.scope === 'favorites' && note.favorite) ||
                (query.scope === 'folder' &&
                  (note.folder === query.folder || note.folder.startsWith(`${query.folder}/`))));
        if (!inScope) continue;
        const body = plain(note.content);
        const haystack = fold(`${note.title} ${body} ${note.folder}`);
        if (!words.every((w) => haystack.includes(w))) continue;
        const first = words.map((w) => fold(body).indexOf(w)).find((i) => i >= 0) ?? 0;
        const start = Math.max(0, first - 50);
        const excerpt = (start > 0 ? '…' : '') + body.slice(start, start + 140);
        hits.push({
          note: summary(note),
          titleHighlight: highlight(note.title, words),
          snippet: highlight(excerpt, words),
        });
      }
      return hits;
    },

    async getSettings() {
      return { ...settings };
    },
    async updateSettings(patch) {
      if ('notesDir' in patch || 'window' in patch) {
        throw new BackendError('invalidInput', 'This setting can’t be changed this way');
      }
      settings = { ...settings, ...patch };
      return { ...settings };
    },

    async getLibraryStatus() {
      return { ...status };
    },
    async chooseNotesDirectory() {
      throw new BackendError('unavailable', 'Choosing a folder is only available in the desktop app.');
    },
    async useDefaultNotesDirectory() {
      return { ...status };
    },
    async retryOpenLibrary() {
      return { ...status };
    },
    async openNotesFolder() {
      throw new BackendError('unavailable', 'Opening folders is only available in the desktop app.');
    },
    async revealNoteFile() {
      throw new BackendError('unavailable', 'Opening folders is only available in the desktop app.');
    },
    async rebuildIndex() {
      return { added: [], updated: [], removed: [], skipped: [] };
    },

    async importFiles() {
      throw new BackendError('unavailable', 'Importing is only available in the desktop app.');
    },
    async importFolder() {
      throw new BackendError('unavailable', 'Importing is only available in the desktop app.');
    },
    async exportNote() {
      throw new BackendError('unavailable', 'Exporting is only available in the desktop app.');
    },
    async exportZip() {
      throw new BackendError('unavailable', 'Exporting is only available in the desktop app.');
    },

    async appReady() {},
    async getAppInfo() {
      return {
        name: 'Linotes',
        version: '0.1.0',
        license: 'MIT',
        tauriVersion: 'browser preview',
        configDir: '(browser preview)',
        dataDir: '(browser preview)',
        notesDir: status.root,
      };
    },
    async openExternalUrl(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    async applyWindowTheme(preference, fallback) {
      return preference === 'system' ? fallback : preference;
    },
    async confirmClose() {},
    async cancelClose() {},

    async onLibraryChanged(handler) {
      changeHandlers.add(handler);
      return () => changeHandlers.delete(handler);
    },
    async onCloseRequested() {
      return () => {};
    },

    simulateExternalEdit(id, content) {
      const note = get(id);
      note.content = content;
      note.rev += 1;
      note.updatedAt = now();
      const report: SyncReport = { added: [], updated: [id], removed: [], skipped: [] };
      changeHandlers.forEach((handler) => handler(report));
    },
  };
  return backend;
}

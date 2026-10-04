import type { JSONContent } from '@tiptap/core';
import { create } from 'zustand';
import { errorMessage, getBackend, isErrorKind } from '@/lib/backend';
import type { EditorMode, Note, NoteSummary, SyncReport } from '@/types/domain';
import { useLibrary } from '@/features/notes/store';
import { useSettings } from '@/features/settings/store';
import { dialogs } from '@/features/ui/dialogs';
import { toast } from '@/features/ui/toasts';
import { analyzeMarkdown, describeReasons } from './markdown/analyze';

/**
 * The open note and its save pipeline.
 *
 * Editors register a "content provider" instead of pushing text on every
 * keystroke; the Markdown is produced only when saving. Saves carry the
 * revision the editor started from, so changes made by other programs are
 * detected (status `conflict`) instead of being overwritten.
 */

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'missing';

/** Wait this long after the last keystroke before saving… */
export const AUTOSAVE_DELAY_MS = 800;
/** …but never let unsaved typing last longer than this. */
export const AUTOSAVE_MAX_WAIT_MS = 5000;
const RETRY_DELAY_MS = 5000;

export interface EditorSession {
  id: string;
  title: string;
  savedTitle: string;
  rev: string;
  /** Markdown the editors start from. */
  content: string;
  /** Parsed document for rich mode (null in Markdown mode). */
  richDoc: JSONContent | null;
  mode: EditorMode;
  /** Why this note can't be shown in rich mode, if it can't. */
  richBlocked: string[] | null;
  folder: string;
  favorite: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
  path: string;
  /** Bumped whenever the editors must be re-created with new content. */
  generation: number;
}

export interface EditorStats {
  words: number;
  characters: number;
}

interface EditorState {
  session: EditorSession | null;
  loadingId: string | null;
  status: SaveStatus;
  error: string | null;
  /** The version on disk, when it conflicts with unsaved edits. */
  conflict: Note | null;
  stats: EditorStats;
  /** Mode chosen by the user this session (falls back to the setting). */
  preferredMode: EditorMode | null;
  focusRequest: { target: 'title' | 'body'; nonce: number } | null;

  open(id: string, options?: { focus?: 'title' | 'body' }): Promise<boolean>;
  close(): Promise<boolean>;
  setTitle(title: string): void;
  markDirty(): void;
  setStats(stats: EditorStats): void;
  save(options?: { force?: boolean }): Promise<boolean>;
  flush(): Promise<boolean>;
  setMode(mode: EditorMode): boolean;
  resolveConflict(choice: 'mine' | 'theirs' | 'copy'): Promise<void>;
  recreateMissing(): Promise<void>;
  applySummary(summary: NoteSummary): void;
  handleExternalChange(report: SyncReport): Promise<void>;
  /** Load the open note again after Linotes itself changed its file (moving it updates image links). */
  reload(): Promise<void>;
  requestFocus(target: 'title' | 'body'): void;
}

// ----- Save pipeline internals (module scope: one editor per window) -------

type SessionKey = string;
const keyOf = (session: Pick<EditorSession, 'id' | 'generation'>): SessionKey =>
  `${session.id}#${session.generation}`;

let provider: { key: SessionKey; get: () => string } | null = null;
let detached: { key: SessionKey; content: string } | null = null;
let editVersion = 0;
let savedVersion = 0;
let dirtySince = 0;
let saving: Promise<boolean> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let generationCounter = 0;

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function resetTracking(): void {
  clearTimer();
  editVersion = 0;
  savedVersion = 0;
  detached = null;
}

function hasUnsavedEdits(): boolean {
  return editVersion !== savedVersion;
}

/**
 * Called by the active editor component. The returned function must be called
 * on unmount; if there are unsaved edits, the latest content is kept so it
 * can still be saved after the editor is gone.
 */
export function registerContentProvider(
  session: Pick<EditorSession, 'id' | 'generation'>,
  get: () => string,
): () => void {
  const key = keyOf(session);
  provider = { key, get };
  if (detached?.key === key) detached = null;
  return () => {
    if (provider?.key !== key) return;
    if (hasUnsavedEdits()) {
      try {
        detached = { key, content: get() };
      } catch {
        // The editor is already torn down; the last saved content stands.
      }
    }
    provider = null;
  };
}

function currentContent(session: EditorSession): string {
  const key = keyOf(session);
  if (provider?.key === key) return provider.get();
  if (detached?.key === key) return detached.content;
  return session.content;
}

function buildSession(note: Note, preferred: EditorMode): EditorSession {
  const analysis = analyzeMarkdown(note.content);
  const mode: EditorMode = preferred === 'rich' && analysis.ok ? 'rich' : 'markdown';
  generationCounter += 1;
  return {
    id: note.id,
    title: note.title,
    savedTitle: note.title,
    rev: note.rev,
    content: note.content,
    richDoc: analysis.ok && mode === 'rich' ? (analysis.doc.toJSON() as JSONContent) : null,
    mode,
    richBlocked: analysis.ok ? null : analysis.reasons,
    folder: note.folder,
    favorite: note.favorite,
    trashed: note.trashed,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    path: note.path,
    generation: generationCounter,
  };
}

function summaryOf(note: Note): NoteSummary {
  const { content: _content, rev: _rev, path: _path, ...summary } = note;
  return summary;
}

// ----- Store ----------------------------------------------------------------

export const useEditorStore = create<EditorState>()((set, get) => {
  const preferredMode = (): EditorMode =>
    get().preferredMode ?? useSettings.getState().settings.defaultEditorMode;

  const scheduleSave = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void get().save();
    }, delay);
  };

  const scheduleAutosave = () => {
    if (!useSettings.getState().settings.autosave) return;
    const waited = Date.now() - dirtySince;
    scheduleSave(Math.max(0, Math.min(AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS - waited)));
  };

  /** Save pending edits; if that fails, ask before abandoning them. */
  const flushOrConfirm = async (): Promise<boolean> => {
    if (await get().flush()) return true;
    const { session, error } = get();
    const confirmed = await dialogs.confirm({
      title: 'Unsaved changes',
      message: `Your latest changes to “${session?.title || 'Untitled'}” couldn’t be saved${
        error ? ` (${error})` : ''
      }. Leave the note and discard them?`,
      confirmLabel: 'Discard Changes',
      cancelLabel: 'Keep Editing',
      destructive: true,
    });
    if (confirmed) {
      resetTracking();
      set({ status: 'saved', error: null, conflict: null });
    }
    return confirmed;
  };

  const loadIntoSession = (note: Note, mode: EditorMode) => {
    resetTracking();
    set({ session: buildSession(note, mode), status: 'saved', error: null, conflict: null });
  };

  return {
    session: null,
    loadingId: null,
    status: 'saved',
    error: null,
    conflict: null,
    stats: { words: 0, characters: 0 },
    preferredMode: null,
    focusRequest: null,

    async open(id, options) {
      const state = get();
      if (state.session?.id === id && state.loadingId === null) {
        if (options?.focus) get().requestFocus(options.focus);
        return true;
      }
      if (!(await flushOrConfirm())) return false;
      set({ loadingId: id });
      try {
        const note = await getBackend().readNote(id);
        if (get().loadingId !== id) return false;
        loadIntoSession(note, preferredMode());
        set({
          loadingId: null,
          focusRequest: options?.focus ? { target: options.focus, nonce: Date.now() } : null,
        });
        useLibrary.getState().upsertNote(summaryOf(note));
        return true;
      } catch (error) {
        if (get().loadingId === id) set({ loadingId: null });
        toast.error('Couldn’t open the note', errorMessage(error));
        return false;
      }
    },

    async close() {
      if (!(await flushOrConfirm())) return false;
      resetTracking();
      set({
        session: null,
        status: 'saved',
        error: null,
        conflict: null,
        stats: { words: 0, characters: 0 },
      });
      return true;
    },

    setTitle(title) {
      const { session } = get();
      if (!session || session.trashed) return;
      set({ session: { ...session, title } });
      get().markDirty();
    },

    markDirty() {
      const { session, status } = get();
      if (!session || session.trashed) return;
      if (!hasUnsavedEdits()) dirtySince = Date.now();
      editVersion += 1;
      if (status === 'conflict' || status === 'missing') return;
      if (status !== 'dirty') set({ status: 'dirty' });
      scheduleAutosave();
    },

    setStats(stats) {
      const current = get().stats;
      if (current.words !== stats.words || current.characters !== stats.characters) set({ stats });
    },

    async save(options = {}) {
      // A loop, checked right before starting: when several callers wait for the
      // same save, the first to resume may already have started the next one.
      while (saving) await saving;
      const { session, status } = get();
      if (!session || session.trashed) return true;
      if (!options.force) {
        if (status === 'conflict' || status === 'missing') return false;
        if (!hasUnsavedEdits()) {
          if (status !== 'saved') set({ status: 'saved', error: null });
          return true;
        }
      }
      clearTimer();
      const version = editVersion;
      const content = currentContent(session);
      const title = session.title;
      set({ status: 'saving' });

      const run = async (): Promise<boolean> => {
        try {
          const saved = await getBackend().saveNote({
            id: session.id,
            title,
            content,
            expectedRev: session.rev,
            force: options.force ?? false,
          });
          useLibrary.getState().upsertNote(saved.summary);
          const current = get().session;
          if (current?.id !== session.id) return true;
          savedVersion = version;
          const stillDirty = hasUnsavedEdits();
          set({
            session: {
              ...current,
              rev: saved.rev,
              savedTitle: title,
              updatedAt: saved.summary.updatedAt,
              folder: saved.summary.folder,
              favorite: saved.summary.favorite,
              path: saved.path,
            },
            status: stillDirty ? 'dirty' : 'saved',
            error: null,
            conflict: null,
          });
          if (stillDirty) scheduleAutosave();
          else if (detached?.key === keyOf(session)) detached = null;
          return true;
        } catch (error) {
          if (get().session?.id !== session.id) return false;
          const message = errorMessage(error);
          if (isErrorKind(error, 'conflict')) {
            const disk = await getBackend()
              .readNote(session.id)
              .catch(() => null);
            set({ status: 'conflict', conflict: disk, error: message });
          } else if (isErrorKind(error, 'fileMissing') || isErrorKind(error, 'notFound')) {
            set({ status: 'missing', error: message });
          } else {
            set({ status: 'error', error: message });
            if (useSettings.getState().settings.autosave) scheduleSave(RETRY_DELAY_MS);
          }
          return false;
        }
      };

      saving = run().finally(() => {
        saving = null;
      });
      return saving;
    },

    async flush() {
      clearTimer();
      while (saving) await saving;
      const { status, session } = get();
      if (!session) return true;
      if (status === 'conflict' || status === 'missing') return !hasUnsavedEdits();
      if (hasUnsavedEdits() || status === 'error') return get().save();
      return true;
    },

    setMode(mode) {
      const { session } = get();
      if (!session || session.mode === mode) return true;
      const content = currentContent(session);
      generationCounter += 1;
      if (mode === 'rich') {
        const analysis = analyzeMarkdown(content);
        if (!analysis.ok) {
          set({ session: { ...session, richBlocked: analysis.reasons } });
          toast.info(
            'This note stays in Markdown mode',
            `It contains ${describeReasons(analysis.reasons)}, which the rich text editor can’t show without changing the note.`,
          );
          return false;
        }
        set({
          session: {
            ...session,
            mode,
            content,
            richDoc: analysis.doc.toJSON() as JSONContent,
            richBlocked: null,
            generation: generationCounter,
          },
          preferredMode: mode,
        });
      } else {
        set({
          session: { ...session, mode, content, richDoc: null, generation: generationCounter },
          preferredMode: mode,
        });
      }
      return true;
    },

    async resolveConflict(choice) {
      const { session } = get();
      if (!session) return;
      if (choice === 'mine') {
        if (await get().save({ force: true })) toast.success('Your version was saved');
        return;
      }
      const backend = getBackend();
      try {
        const disk = get().conflict ?? (await backend.readNote(session.id));
        if (choice === 'copy') {
          const content = currentContent(session);
          const copy = await backend.createNote(
            session.folder,
            `${session.title || 'Untitled'} (my version)`,
          );
          const saved = await backend.saveNote({
            id: copy.id,
            title: copy.title,
            content,
            expectedRev: copy.rev,
          });
          useLibrary.getState().upsertNote(saved.summary);
          toast.success('Your version was saved as a new note', saved.summary.title);
        }
        loadIntoSession(disk, session.mode);
        useLibrary.getState().upsertNote(summaryOf(disk));
      } catch (error) {
        toast.error('Couldn’t resolve the conflict', errorMessage(error));
      }
    },

    async recreateMissing() {
      if (await get().save({ force: true })) toast.success('The note file was recreated');
    },

    applySummary(summary) {
      const { session } = get();
      if (session?.id !== summary.id) return;
      set({
        session: {
          ...session,
          favorite: summary.favorite,
          folder: summary.folder,
          trashed: summary.trashed,
          updatedAt: summary.updatedAt,
        },
      });
    },

    async handleExternalChange(report) {
      const { session } = get();
      if (!session) return;
      const id = session.id;
      if (report.removed.includes(id)) {
        if (get().status !== 'saving')
          set({ status: 'missing', error: 'The file was moved or deleted outside Linotes.' });
        return;
      }
      if (!report.updated.includes(id) && !report.added.includes(id)) return;
      while (saving) await saving;
      let disk: Note;
      try {
        disk = await getBackend().readNote(id);
      } catch {
        return;
      }
      const current = get().session;
      if (current?.id !== id) return;
      if (disk.rev === current.rev) {
        // Only metadata changed (e.g. frontmatter edited elsewhere).
        set({
          session: {
            ...current,
            favorite: disk.favorite,
            folder: disk.folder,
            updatedAt: disk.updatedAt,
            path: disk.path,
          },
          ...(get().status === 'missing' && !hasUnsavedEdits()
            ? { status: 'saved' as const, error: null }
            : {}),
        });
        return;
      }
      if (!hasUnsavedEdits()) {
        loadIntoSession(disk, current.mode);
        toast.info('Note updated', 'Changes made outside Linotes were loaded.');
      } else {
        set({ status: 'conflict', conflict: disk, error: 'The note was changed outside Linotes.' });
      }
    },

    async reload() {
      while (saving) await saving;
      const { session } = get();
      if (!session || hasUnsavedEdits()) return;
      try {
        const disk = await getBackend().readNote(session.id);
        const current = get().session;
        if (current?.id !== disk.id || current.rev === disk.rev || hasUnsavedEdits()) return;
        loadIntoSession(disk, current.mode);
        useLibrary.getState().upsertNote(summaryOf(disk));
      } catch {
        // The note stays as it is; a later save reports any problem.
      }
    },

    requestFocus(target) {
      set({ focusRequest: { target, nonce: Date.now() } });
    },
  };
});

/** For tests: reset module-level save tracking. */
export function __resetEditorInternals(): void {
  resetTracking();
  provider = null;
  saving = null;
}

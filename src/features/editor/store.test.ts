import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBackend } from '@/lib/backend';
import { createMemoryBackend, type MemoryBackend } from '@/lib/backend/memory';
import { useSettings } from '@/features/settings/store';
import type { SavedNote, SaveNoteInput } from '@/types/domain';
import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MAX_WAIT_MS,
  __resetEditorInternals,
  registerContentProvider,
  useEditorStore,
} from './store';

let backend: MemoryBackend;
let text = '';
let unregister: (() => void) | null = null;

const state = () => useEditorStore.getState();

async function openDraft(content = ''): Promise<string> {
  const note = await backend.createNote('', 'Draft');
  if (content) await backend.saveNote({ id: note.id, title: 'Draft', content, expectedRev: note.rev });
  await state().open(note.id);
  text = state().session!.content;
  unregister = registerContentProvider(state().session!, () => text);
  return note.id;
}

function type(value: string) {
  text = value;
  state().markDirty();
}

beforeEach(async () => {
  backend = createMemoryBackend();
  setBackend(backend);
  __resetEditorInternals();
  useEditorStore.setState({
    session: null,
    status: 'saved',
    error: null,
    conflict: null,
    preferredMode: null,
  });
  await useSettings.getState().load();
  vi.useFakeTimers();
});

afterEach(() => {
  unregister?.();
  unregister = null;
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves shortly after typing stops', async () => {
    const id = await openDraft();
    type('hello');
    expect(state().status).toBe('dirty');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    expect((await backend.readNote(id)).content).toBe('');
    await vi.advanceTimersByTimeAsync(200);
    expect(state().status).toBe('saved');
    expect((await backend.readNote(id)).content).toBe('hello\n');
  });

  it('saves during long uninterrupted typing', async () => {
    const id = await openDraft();
    for (let elapsed = 0; elapsed <= AUTOSAVE_MAX_WAIT_MS + 500; elapsed += 300) {
      type(`typing ${elapsed}`);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect((await backend.readNote(id)).content).toMatch(/^typing \d+\n$/);
  });

  it('waits for Ctrl+S or a switch when "save while typing" is off', async () => {
    await useSettings.getState().update({ autosave: false });
    const id = await openDraft();
    type('manual');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS * 3);
    expect(state().status).toBe('dirty');
    expect(await state().flush()).toBe(true);
    expect((await backend.readNote(id)).content).toBe('manual\n');
  });

  it('saves title changes and keeps the list in sync', async () => {
    const id = await openDraft();
    state().setTitle('Renamed');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50);
    expect((await backend.readNote(id)).title).toBe('Renamed');
  });

  it('keeps edits typed while a save is in flight', async () => {
    const id = await openDraft();
    const original = backend.saveNote.bind(backend);
    let release: (() => void) | null = null;
    backend.saveNote = (input: SaveNoteInput): Promise<SavedNote> =>
      new Promise((resolve, reject) => {
        release = () => void original(input).then(resolve, reject);
      });
    type('first');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(state().status).toBe('saving');
    type('first and second');
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(state().status).toBe('dirty');
    backend.saveNote = original;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(state().status).toBe('saved');
    expect((await backend.readNote(id)).content).toBe('first and second\n');
  });

  it('still saves text after the editor is unmounted', async () => {
    const id = await openDraft();
    type('written before unmount');
    unregister!();
    unregister = null;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect((await backend.readNote(id)).content).toBe('written before unmount\n');
  });
});

describe('outside changes', () => {
  it('never overwrites a note changed on disk; the user chooses', async () => {
    const id = await openDraft('original');
    backend.simulateExternalEdit(id, 'theirs\n');
    type('mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(state().status).toBe('conflict');
    expect(state().conflict?.content).toBe('theirs\n');
    expect((await backend.readNote(id)).content).toBe('theirs\n');

    // Further typing does not sneak past the conflict.
    type('mine, more');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS * 2);
    expect((await backend.readNote(id)).content).toBe('theirs\n');

    await state().resolveConflict('mine');
    expect(state().status).toBe('saved');
    expect((await backend.readNote(id)).content).toBe('mine, more\n');
  });

  it('can take the disk version and keep a copy of mine', async () => {
    const id = await openDraft('original');
    backend.simulateExternalEdit(id, 'theirs\n');
    type('my text');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    await state().resolveConflict('copy');
    expect(state().session?.content).toBe('theirs\n');
    const copies = (await backend.listNotes()).filter((n) => n.title === 'Draft (my version)');
    expect(copies).toHaveLength(1);
    expect((await backend.readNote(copies[0]!.id)).content).toBe('my text\n');
  });

  it('reloads a note with no unsaved edits', async () => {
    const id = await openDraft('original');
    const generation = state().session!.generation;
    backend.simulateExternalEdit(id, 'updated elsewhere\n');
    await state().handleExternalChange({ added: [], updated: [id], removed: [], skipped: [] });
    expect(state().session?.content).toBe('updated elsewhere\n');
    expect(state().session!.generation).toBeGreaterThan(generation);
    expect(state().status).toBe('saved');
  });

  it('marks a note whose file disappeared', async () => {
    const id = await openDraft('x');
    await state().handleExternalChange({ added: [], updated: [], removed: [id], skipped: [] });
    expect(state().status).toBe('missing');
  });
});

describe('editing modes', () => {
  it('keeps unsupported Markdown out of the rich editor', async () => {
    await openDraft('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(state().session?.mode).toBe('markdown');
    expect(state().session?.richBlocked).toContain('tables');
    expect(state().setMode('rich')).toBe(false);
    expect(state().session?.mode).toBe('markdown');
  });

  it('carries the current text across a mode switch', async () => {
    await openDraft('# Hello\n');
    expect(state().session?.mode).toBe('rich');
    type('# Changed\n');
    expect(state().setMode('markdown')).toBe(true);
    expect(state().session?.content).toBe('# Changed\n');
    expect(state().status).toBe('dirty');
  });
});

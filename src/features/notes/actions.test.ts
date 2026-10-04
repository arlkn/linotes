import { beforeEach, describe, expect, it } from 'vitest';
import { setBackend } from '@/lib/backend';
import { createMemoryBackend, type MemoryBackend } from '@/lib/backend/memory';
import { __resetEditorInternals, useEditorStore } from '@/features/editor/store';
import { useSettings } from '@/features/settings/store';
import type { Note } from '@/types/domain';
import { loadLibraryData, selectNote } from './actions';
import { useLibrary } from './store';

let backend: MemoryBackend;

async function waitForReads(pending: Map<string, unknown>, count: number): Promise<void> {
  while (pending.size < count) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  backend = createMemoryBackend();
  setBackend(backend);
  __resetEditorInternals();
  useEditorStore.setState({ session: null, loadingId: null, status: 'saved', error: null, conflict: null });
  useLibrary.setState({ selectedId: null });
  await useSettings.getState().load();
});

describe('selecting notes', () => {
  it('keeps the list on the note the editor ends up showing when selections overlap', async () => {
    const first = await backend.createNote('', 'First');
    const slow = await backend.createNote('', 'Slow');
    const last = await backend.createNote('', 'Last');
    await loadLibraryData();
    await selectNote(first.id);

    // Both reads are slow, and the older one arrives first (e.g. holding ↓ in the list).
    const read = backend.readNote.bind(backend);
    const pending = new Map<string, () => void>();
    backend.readNote = (id: string): Promise<Note> =>
      new Promise((resolve) => pending.set(id, () => void read(id).then(resolve)));

    const toSlow = selectNote(slow.id);
    const toLast = selectNote(last.id);
    await waitForReads(pending, 2);
    pending.get(slow.id)!();
    await toSlow;
    pending.get(last.id)!();
    await toLast;

    expect(useEditorStore.getState().session?.id).toBe(last.id);
    expect(useLibrary.getState().selectedId).toBe(last.id);
  });
});

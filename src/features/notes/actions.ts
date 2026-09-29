import { errorMessage, getBackend } from '@/lib/backend';
import type { NoteSummary } from '@/types/domain';
import { useEditorStore } from '@/features/editor/store';
import { useSettings } from '@/features/settings/store';
import { dialogs } from '@/features/ui/dialogs';
import { toast } from '@/features/ui/toasts';
import { folderLabel } from './folder-tree';
import { useLibrary } from './store';
import { notesForView, searchScopeFor, type View } from './views';

/** Run an action, reporting failures as a toast instead of throwing. */
async function attempt<T>(title: string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    toast.error(title, errorMessage(error));
    return undefined;
  }
}

function visibleNotes(): NoteSummary[] {
  const { notes, view } = useLibrary.getState();
  const { sortField, sortDirection } = useSettings.getState().settings;
  return notesForView(notes, view, sortField, sortDirection);
}

// ----- Loading ----------------------------------------------------------------

export async function loadLibraryData(): Promise<void> {
  const backend = getBackend();
  const [notes, folders] = await Promise.all([backend.listNotes(), backend.listFolders()]);
  useLibrary.getState().setData(notes, folders);
}

export async function refreshFolders(): Promise<void> {
  const folders = await getBackend().listFolders();
  useLibrary.getState().setFolders(folders);
}

export async function refreshLibrary(): Promise<void> {
  await attempt('Couldn’t refresh your notes', loadLibraryData);
  const { session } = useEditorStore.getState();
  if (session) {
    const summary = useLibrary.getState().notes.find((n) => n.id === session.id);
    if (summary) useEditorStore.getState().applySummary(summary);
  }
  const { searchText } = useLibrary.getState();
  if (searchText.trim()) await runSearch(searchText);
}

// ----- Selection and views ------------------------------------------------------

export async function selectNote(
  id: string | null,
  options?: { focus?: 'title' | 'body' },
): Promise<boolean> {
  const library = useLibrary.getState();
  if (id === null) {
    if (!(await useEditorStore.getState().close())) return false;
    library.select(null);
    return true;
  }
  const previous = library.selectedId;
  library.select(id);
  const opened = await useEditorStore.getState().open(id, options);
  if (!opened) {
    // Keep the selection in sync with what the editor actually shows.
    library.select(useEditorStore.getState().session?.id ?? previous);
    return false;
  }
  if (useSettings.getState().settings.lastNoteId !== id)
    void useSettings.getState().update({ lastNoteId: id });
  return true;
}

export function setView(view: View): void {
  const library = useLibrary.getState();
  library.setView(view);
  if (library.searchText) void runSearch(library.searchText);
}

/** Select the note after (or before) `id` in the current list — used after removing it. */
async function selectNeighbour(id: string, list: NoteSummary[]): Promise<void> {
  const index = list.findIndex((n) => n.id === id);
  const next = list[index + 1] ?? list[index - 1] ?? null;
  await selectNote(next && next.id !== id ? next.id : null);
}

// ----- Notes --------------------------------------------------------------------

export async function createNote(options: { folder?: string } = {}): Promise<void> {
  const library = useLibrary.getState();
  const { view } = library;
  const folder = options.folder ?? (view.kind === 'folder' ? view.path : '');
  if (!(await useEditorStore.getState().flush()) && !(await useEditorStore.getState().close())) return;
  const note = await attempt('Couldn’t create a note', () => getBackend().createNote(folder));
  if (!note) return;
  let summary: NoteSummary = note;
  if (view.kind === 'favorites') {
    summary =
      (await attempt('Couldn’t add to favorites', () => getBackend().setFavorite(note.id, true))) ?? note;
  }
  if (view.kind === 'trash' || (view.kind === 'folder' && view.path !== folder)) {
    library.setView(folder ? { kind: 'folder', path: folder } : { kind: 'all' });
  }
  library.upsertNote(summary);
  library.setSearch({ searchText: '', searchResults: null });
  await refreshFoldersQuietly();
  await selectNote(note.id, { focus: 'title' });
}

export async function toggleFavorite(id: string): Promise<void> {
  const note = useLibrary.getState().notes.find((n) => n.id === id);
  if (!note || note.trashed) return;
  const updated = await attempt('Couldn’t update favorites', () =>
    getBackend().setFavorite(id, !note.favorite),
  );
  if (!updated) return;
  useLibrary.getState().upsertNote(updated);
  useEditorStore.getState().applySummary(updated);
}

export async function moveNote(id: string, folder?: string): Promise<void> {
  const note = useLibrary.getState().notes.find((n) => n.id === id);
  if (!note) return;
  const target =
    folder ??
    (await dialogs.pickFolder({
      title: `Move “${note.title || 'Untitled'}”`,
      confirmLabel: 'Move',
      current: note.folder,
    }));
  if (target === null || target === note.folder) return;
  if (useEditorStore.getState().session?.id === id && !(await useEditorStore.getState().flush())) {
    toast.error('Save the note before moving it', useEditorStore.getState().error ?? undefined);
    return;
  }
  const updated = await attempt('Couldn’t move the note', () => getBackend().moveNote(id, target));
  if (!updated) return;
  useLibrary.getState().upsertNote(updated);
  useEditorStore.getState().applySummary(updated);
  await refreshFoldersQuietly();
  toast.success(`Moved to ${folderLabel(target)}`);
}

export async function trashNote(id: string): Promise<void> {
  const editor = useEditorStore.getState();
  const isOpen = editor.session?.id === id;
  if (isOpen && !(await editor.flush())) {
    const discard = await dialogs.confirm({
      title: 'Move to Trash?',
      message: 'The latest changes to this note couldn’t be saved. Move it to the Trash anyway?',
      confirmLabel: 'Move to Trash',
      destructive: true,
    });
    if (!discard) return;
  }
  const listBefore = visibleNotes();
  const updated = await attempt('Couldn’t move the note to the Trash', () => getBackend().trashNote(id));
  if (!updated) return;
  useLibrary.getState().upsertNote(updated);
  if (isOpen) {
    await useEditorStore.getState().close();
    if (useLibrary.getState().view.kind !== 'trash') await selectNeighbour(id, listBefore);
    else useEditorStore.getState().applySummary(updated);
  }
  await refreshFoldersQuietly();
  toast.info('Moved to Trash', updated.title || 'Untitled', {
    label: 'Undo',
    run: () => void restoreNote(id),
  });
}

export async function restoreNote(id: string): Promise<void> {
  const listBefore = visibleNotes();
  const updated = await attempt('Couldn’t restore the note', () => getBackend().restoreNote(id));
  if (!updated) return;
  useLibrary.getState().upsertNote(updated);
  useEditorStore.getState().applySummary(updated);
  await refreshFoldersQuietly();
  if (useLibrary.getState().view.kind === 'trash' && useLibrary.getState().selectedId === id) {
    await selectNeighbour(id, listBefore);
  }
  toast.success('Note restored', updated.folder ? `Back in ${folderLabel(updated.folder)}` : undefined);
}

export async function deleteNotePermanently(id: string): Promise<void> {
  const note = useLibrary.getState().notes.find((n) => n.id === id);
  if (!note) return;
  const confirmed = await dialogs.confirm({
    title: 'Delete permanently?',
    message: `“${note.title || 'Untitled'}” will be deleted from your disk. This can’t be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!confirmed) return;
  const listBefore = visibleNotes();
  const ok = await attempt('Couldn’t delete the note', () => getBackend().deleteNotePermanently(id));
  if (ok === undefined) return;
  const wasOpen = useEditorStore.getState().session?.id === id;
  useLibrary.getState().removeNote(id);
  if (wasOpen) {
    await useEditorStore.getState().close();
    await selectNeighbour(id, listBefore);
  }
}

export async function emptyTrash(): Promise<void> {
  const count = useLibrary.getState().notes.filter((n) => n.trashed).length;
  if (count === 0) return;
  const confirmed = await dialogs.confirm({
    title: 'Empty the Trash?',
    message: `${count === 1 ? 'The note' : `All ${count} notes`} in the Trash will be deleted from your disk. This can’t be undone.`,
    confirmLabel: 'Empty Trash',
    destructive: true,
  });
  if (!confirmed) return;
  const openId = useEditorStore.getState().session?.id;
  const deleted = await attempt('Couldn’t empty the Trash', () => getBackend().emptyTrash());
  if (deleted === undefined) return;
  if (openId && useLibrary.getState().notes.find((n) => n.id === openId)?.trashed) {
    await useEditorStore.getState().close();
    useLibrary.getState().select(null);
  }
  await refreshLibrary();
  toast.success(`Deleted ${deleted} ${deleted === 1 ? 'note' : 'notes'}`);
}

// ----- Folders ------------------------------------------------------------------

async function refreshFoldersQuietly(): Promise<void> {
  try {
    await refreshFolders();
  } catch {
    // Counts refresh on the next change; not worth interrupting the user.
  }
}

function validateFolderName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.startsWith('.')) return 'Folder names can’t start with a dot.';
  if (trimmed.length > 120) return 'That name is too long.';
  return null;
}

export async function createFolder(parent = ''): Promise<void> {
  const name = await dialogs.prompt({
    title: parent ? `New Folder in “${parent.split('/').pop()}”` : 'New Folder',
    label: 'Folder name',
    placeholder: 'e.g. Projects',
    confirmLabel: 'Create',
    validate: validateFolderName,
  });
  if (name === null) return;
  const folder = await attempt('Couldn’t create the folder', () => getBackend().createFolder(parent, name));
  if (!folder) return;
  await refreshFoldersQuietly();
  if (parent) useLibrary.getState().toggleFolderCollapsed(parent, false);
  setView({ kind: 'folder', path: folder.path });
}

export async function renameFolder(path: string): Promise<void> {
  const current = path.split('/').pop() ?? path;
  const name = await dialogs.prompt({
    title: 'Rename Folder',
    label: 'Folder name',
    initialValue: current,
    confirmLabel: 'Rename',
    validate: validateFolderName,
  });
  if (name === null || name.trim() === current) return;
  if (!(await useEditorStore.getState().flush())) {
    toast.error('Save the open note before renaming folders', useEditorStore.getState().error ?? undefined);
    return;
  }
  const renamed = await attempt('Couldn’t rename the folder', () => getBackend().renameFolder(path, name));
  if (!renamed) return;
  const { view } = useLibrary.getState();
  if (view.kind === 'folder' && (view.path === path || view.path.startsWith(`${path}/`))) {
    useLibrary.getState().setView({ kind: 'folder', path: renamed.path + view.path.slice(path.length) });
  }
  await refreshLibrary();
}

export async function deleteFolder(path: string): Promise<void> {
  const { notes } = useLibrary.getState();
  const inside = notes.filter(
    (n) => !n.trashed && (n.folder === path || n.folder.startsWith(`${path}/`)),
  ).length;
  const confirmed = await dialogs.confirm({
    title: `Delete “${path.split('/').pop()}”?`,
    message:
      inside === 0
        ? 'The folder is empty and will be removed.'
        : `The folder will be removed and its ${inside === 1 ? 'note' : `${inside} notes`} moved to the Trash, where you can restore ${inside === 1 ? 'it' : 'them'}.`,
    confirmLabel: 'Delete Folder',
    destructive: true,
  });
  if (!confirmed) return;
  const openFolder = useEditorStore.getState().session?.folder ?? null;
  const affectsOpenNote = openFolder !== null && (openFolder === path || openFolder.startsWith(`${path}/`));
  if (affectsOpenNote && !(await useEditorStore.getState().flush())) {
    toast.error(
      'Save the open note before deleting its folder',
      useEditorStore.getState().error ?? undefined,
    );
    return;
  }
  const report = await attempt('Couldn’t delete the folder', () => getBackend().deleteFolder(path));
  if (!report) return;
  if (affectsOpenNote) {
    await useEditorStore.getState().close();
    useLibrary.getState().select(null);
  }
  const { view } = useLibrary.getState();
  if (view.kind === 'folder' && (view.path === path || view.path.startsWith(`${path}/`))) {
    useLibrary.getState().setView({ kind: 'all' });
  }
  await refreshLibrary();
  if (!report.removed) {
    toast.info(
      'The folder was kept',
      `It still contains ${report.remainingFiles.length} other ${report.remainingFiles.length === 1 ? 'file' : 'files'} that aren’t notes.`,
    );
  } else if (report.trashedNotes > 0) {
    toast.info(
      'Folder deleted',
      `${report.trashedNotes} ${report.trashedNotes === 1 ? 'note was' : 'notes were'} moved to the Trash.`,
    );
  }
}

// ----- Search -------------------------------------------------------------------

let searchSequence = 0;

export async function runSearch(text: string): Promise<void> {
  const library = useLibrary.getState();
  const sequence = ++searchSequence;
  if (!text.trim()) {
    library.setSearch({ searchText: text, searchResults: null, searching: false });
    return;
  }
  library.setSearch({ searchText: text, searching: true });
  const { scope, folder } = library.searchEverywhere
    ? { scope: 'all' as const, folder: null }
    : searchScopeFor(library.view);
  try {
    const results = await getBackend().searchNotes({ text, scope, folder });
    if (sequence === searchSequence)
      useLibrary.getState().setSearch({ searchResults: results, searching: false });
  } catch (error) {
    if (sequence === searchSequence) {
      useLibrary.getState().setSearch({ searchResults: [], searching: false });
      toast.error('Search failed', errorMessage(error));
    }
  }
}

export function setSearchEverywhere(everywhere: boolean): void {
  useLibrary.getState().setSearch({ searchEverywhere: everywhere });
  const { searchText } = useLibrary.getState();
  if (searchText.trim()) void runSearch(searchText);
}

export function clearSearch(): void {
  searchSequence += 1;
  useLibrary.getState().setSearch({ searchText: '', searchResults: null, searching: false });
}

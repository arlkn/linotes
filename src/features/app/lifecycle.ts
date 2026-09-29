import { errorMessage, getBackend, type Unlisten } from '@/lib/backend';
import type { LibraryStatus } from '@/types/domain';
import { useEditorStore } from '@/features/editor/store';
import { WELCOME_NOTE_BODY, WELCOME_NOTE_TITLE } from '@/features/onboarding/welcome';
import { loadLibraryData, refreshLibrary, selectNote } from '@/features/notes/actions';
import { useLibrary } from '@/features/notes/store';
import { notesForView } from '@/features/notes/views';
import { applyAppearance, watchSystemTheme } from '@/features/settings/appearance';
import { useSettings } from '@/features/settings/store';
import { dialogs } from '@/features/ui/dialogs';
import { toast } from '@/features/ui/toasts';

let listeners: Unlisten[] = [];

/** Start the app: settings → theme → library → first note. Shows the window when done. */
export async function bootstrap(): Promise<void> {
  const backend = getBackend();
  try {
    await useSettings.getState().load();
  } catch (error) {
    applyAppearance(useSettings.getState().settings);
    toast.error('Couldn’t load settings; using defaults', errorMessage(error));
  }
  listeners.push(watchSystemTheme(() => applyAppearance(useSettings.getState().settings)));

  try {
    const status = await backend.getLibraryStatus();
    await openLibrary(status, { restoreLastNote: true });
  } catch (error) {
    toast.error('Couldn’t open your notes', errorMessage(error));
  }

  listeners.push(
    await backend.onLibraryChanged((report) => {
      void refreshLibrary();
      void useEditorStore.getState().handleExternalChange(report);
    }),
  );
  listeners.push(await backend.onCloseRequested(() => void requestQuit()));
  await backend.appReady();
}

export function teardown(): void {
  listeners.forEach((unlisten) => unlisten());
  listeners = [];
}

async function openLibrary(status: LibraryStatus, options: { restoreLastNote: boolean }): Promise<void> {
  const library = useLibrary.getState();
  library.setStatus(status);
  if (!status.ready) return;
  await loadLibraryData();
  await createWelcomeNoteOnFirstRun();
  reportStartupIssues(status);

  const { settings } = useSettings.getState();
  const { notes } = useLibrary.getState();
  const last = options.restoreLastNote
    ? notes.find((n) => n.id === settings.lastNoteId && !n.trashed)
    : undefined;
  const first = notesForView(notes, { kind: 'all' }, settings.sortField, settings.sortDirection)[0];
  const target = last ?? first;
  if (target) await selectNote(target.id);
}

async function createWelcomeNoteOnFirstRun(): Promise<void> {
  const { settings, update } = useSettings.getState();
  if (settings.onboarded) return;
  const { notes, folders } = useLibrary.getState();
  if (notes.length === 0 && folders.length === 0) {
    try {
      const backend = getBackend();
      const note = await backend.createNote('', WELCOME_NOTE_TITLE);
      await backend.saveNote({
        id: note.id,
        title: note.title,
        content: WELCOME_NOTE_BODY,
        expectedRev: note.rev,
      });
      await loadLibraryData();
    } catch (error) {
      console.warn('[linotes] Could not create the welcome note', error);
    }
  }
  await update({ onboarded: true });
}

function reportStartupIssues(status: LibraryStatus): void {
  for (const file of status.recovered) {
    if (file.action === 'preserved') {
      toast.info(
        'Recovered text from an interrupted save',
        `A newer copy of ${file.original} was kept at ${file.savedTo}. Compare it with the note and copy anything you need.`,
      );
    }
  }
  if (status.rebuiltIndex) {
    toast.info(
      'Search index rebuilt',
      'The index was damaged and has been rebuilt from your notes. No notes were affected.',
    );
  }
  if (status.skipped.length > 0) {
    const names = status.skipped
      .slice(0, 3)
      .map((s) => `${s.path} (${s.reason})`)
      .join(', ');
    toast.info(
      `${status.skipped.length} ${status.skipped.length === 1 ? 'file' : 'files'} couldn’t be read`,
      `${names}${status.skipped.length > 3 ? ', …' : ''}. They were left untouched.`,
    );
  }
  if (status.watcherError) {
    toast.info('Live updates are off', status.watcherError);
  }
}

// ----- Closing ------------------------------------------------------------------

let quitting = false;

/** Save pending edits, then close the window. Asks if saving fails. */
export async function requestQuit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  const backend = getBackend();
  try {
    const saved = await useEditorStore.getState().flush();
    if (!saved) {
      const closeAnyway = await dialogs.confirm({
        title: 'Close without saving?',
        message: `The latest changes to “${useEditorStore.getState().session?.title || 'Untitled'}” couldn’t be saved. ${
          useEditorStore.getState().error ?? ''
        }`,
        confirmLabel: 'Close Anyway',
        cancelLabel: 'Keep Editing',
        destructive: true,
      });
      if (!closeAnyway) {
        await backend.cancelClose();
        return;
      }
    }
    await backend.confirmClose();
  } finally {
    quitting = false;
  }
}

// ----- Notes folder -------------------------------------------------------------

async function switchLibrary(change: () => Promise<LibraryStatus | null>): Promise<void> {
  if (!(await useEditorStore.getState().close())) return;
  try {
    const status = await change();
    if (!status) return;
    useLibrary.getState().select(null);
    useLibrary.getState().setView({ kind: 'all' });
    useLibrary.getState().setSearch({ searchText: '', searchResults: null });
    await openLibrary(status, { restoreLastNote: false });
    if (status.ready) toast.success('Notes folder changed', status.root);
  } catch (error) {
    toast.error('Couldn’t use that folder', errorMessage(error));
  }
}

export function chooseNotesFolder(): Promise<void> {
  return switchLibrary(() => getBackend().chooseNotesDirectory());
}

export function switchToDefaultNotesFolder(): Promise<void> {
  return switchLibrary(() => getBackend().useDefaultNotesDirectory());
}

export async function retryOpenLibrary(): Promise<void> {
  try {
    const status = await getBackend().retryOpenLibrary();
    await openLibrary(status, { restoreLastNote: true });
    if (!status.ready) toast.error('The notes folder is still unavailable', status.error ?? undefined);
  } catch (error) {
    toast.error('Couldn’t open the notes folder', errorMessage(error));
  }
}

export async function openNotesFolderInFiles(): Promise<void> {
  try {
    await getBackend().openNotesFolder();
  } catch (error) {
    toast.error('Couldn’t open the folder', errorMessage(error));
  }
}

export async function rebuildSearchIndex(): Promise<void> {
  try {
    const report = await getBackend().rebuildIndex();
    await refreshLibrary();
    const skipped = report.skipped.length;
    toast.success(
      'Search index rebuilt',
      skipped
        ? `${skipped} ${skipped === 1 ? 'file' : 'files'} couldn’t be read and were skipped.`
        : undefined,
    );
  } catch (error) {
    toast.error('Couldn’t rebuild the index', errorMessage(error));
  }
}

export async function openExternalLink(url: string): Promise<void> {
  try {
    await getBackend().openExternalUrl(url);
  } catch (error) {
    toast.error('Couldn’t open the link', errorMessage(error));
  }
}

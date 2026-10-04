import { ArrowUpDown, Clock, Folder, NotebookPen, PanelLeft, Plus, SearchX, Star, Trash } from 'lucide-react';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, IconButton } from '@/components/ui/button';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { Spinner } from '@/components/ui/controls';
import {
  createNote,
  deleteNotePermanently,
  emptyTrash,
  selectNote,
  setSearchEverywhere,
  trashNote,
} from '@/features/notes/actions';
import { useLibrary } from '@/features/notes/store';
import { notesForView, viewTitle, RECENT_DAYS, type View } from '@/features/notes/views';
import { useEditorStore } from '@/features/editor/store';
import { useSettings } from '@/features/settings/store';
import { useUi } from '@/features/ui/ui-store';
import type { NoteSummary, SortDirection, SortField } from '@/types/domain';
import { EmptyState } from './empty-state';
import { Highlighted } from './highlight';
import { NoteListItem } from './note-list-item';
import { NoteListMenu } from './note-list-menu';
import { SearchField } from './search-field';

function ViewEmptyState({ view }: { view: View }) {
  switch (view.kind) {
    case 'favorites':
      return (
        <EmptyState
          icon={Star}
          title="No favorites yet"
          description="Star the notes you use most and they’ll wait for you here."
        />
      );
    case 'recent':
      return (
        <EmptyState
          icon={Clock}
          title="Nothing edited recently"
          description={`Notes you change in the last ${RECENT_DAYS} days appear here.`}
        />
      );
    case 'trash':
      return (
        <EmptyState
          icon={Trash}
          title="Trash is empty"
          description="Deleted notes stay here until you remove them permanently."
        />
      );
    case 'folder':
      return (
        <EmptyState
          icon={Folder}
          title="This folder is empty"
          description="Create a note here, or drag notes onto the folder in the sidebar."
          action={
            <Button variant="primary" onClick={() => void createNote({ folder: view.path })}>
              <Plus className="size-4" strokeWidth={2.2} /> New Note
            </Button>
          }
        />
      );
    default:
      return (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description="Your notes are saved as Markdown files on this computer."
          action={
            <Button variant="primary" onClick={() => void createNote()}>
              <Plus className="size-4" strokeWidth={2.2} /> New Note
            </Button>
          }
        />
      );
  }
}

const SORT_LABELS: Record<SortField, string> = {
  modified: 'Date modified',
  created: 'Date created',
  title: 'Title',
};

function SortMenu() {
  const { sortField, sortDirection } = useSettings(
    useShallow((s) => ({ sortField: s.settings.sortField, sortDirection: s.settings.sortDirection })),
  );
  const update = useSettings((s) => s.update);
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={`Sort: ${SORT_LABELS[sortField]}`} icon={ArrowUpDown} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Sort by</MenuLabel>
        <MenuRadioGroup value={sortField} onValueChange={(v) => void update({ sortField: v as SortField })}>
          {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
            <MenuRadioItem key={field} value={field}>
              {SORT_LABELS[field]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup
          value={sortDirection}
          onValueChange={(v) => void update({ sortDirection: v as SortDirection })}
        >
          <MenuRadioItem value="desc">{sortField === 'title' ? 'Z to A' : 'Newest first'}</MenuRadioItem>
          <MenuRadioItem value="asc">{sortField === 'title' ? 'A to Z' : 'Oldest first'}</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function NotesPane({ sidebarHidden }: { sidebarHidden: boolean }) {
  const { notes, view, selectedId, searchText, searchResults, searching, searchEverywhere, loaded } =
    useLibrary(
      useShallow((s) => ({
        notes: s.notes,
        view: s.view,
        selectedId: s.selectedId,
        searchText: s.searchText,
        searchResults: s.searchResults,
        searching: s.searching,
        searchEverywhere: s.searchEverywhere,
        loaded: s.loaded,
      })),
    );
  const { sortField, sortDirection } = useSettings(
    useShallow((s) => ({ sortField: s.settings.sortField, sortDirection: s.settings.sortDirection })),
  );
  const listFocusNonce = useUi((s) => s.listFocusNonce);
  const setOverlay = useUi((s) => s.setSidebarOverlay);
  const listRef = useRef<HTMLDivElement>(null);

  const viewNotes = useMemo(
    () => notesForView(notes, view, sortField, sortDirection),
    [notes, view, sortField, sortDirection],
  );
  const showingResults = searchResults !== null && searchText.trim() !== '';
  const items: NoteSummary[] = showingResults ? searchResults.map((hit) => hit.note) : viewNotes;
  const showFolder = showingResults || view.kind !== 'folder';

  // Keep the selected note visible.
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`note-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, items]);

  useEffect(() => {
    if (listFocusNonce > 0) listRef.current?.focus();
  }, [listFocusNonce]);

  const focusList = () => {
    listRef.current?.focus();
    if (!items.some((n) => n.id === selectedId) && items[0]) void selectNote(items[0].id);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const index = items.findIndex((n) => n.id === selectedId);
    const move = (to: number) => {
      const target = items[Math.max(0, Math.min(items.length - 1, to))];
      if (target) void selectNote(target.id);
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (index <= 0) useUi.getState().focusSearch();
        else move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(items.length - 1);
        break;
      case 'PageDown':
        event.preventDefault();
        move(index + 8);
        break;
      case 'PageUp':
        event.preventDefault();
        move(index - 8);
        break;
      case 'Enter':
        if (selectedId) {
          event.preventDefault();
          useEditorStore.getState().requestFocus('body');
        }
        break;
      case 'Delete':
        if (selectedId) {
          event.preventDefault();
          const note = items[index];
          if (note?.trashed) void deleteNotePermanently(note.id);
          else if (note) void trashNote(note.id);
        }
        break;
    }
  };

  const title = showingResults ? 'Search' : viewTitle(view);
  const scopeLabel = view.kind === 'all' || view.kind === 'recent' ? null : viewTitle(view);

  return (
    <div className="flex h-full flex-col border-r border-line bg-app">
      <header className="flex h-[3.25rem] shrink-0 items-center gap-1 pr-2 pl-3">
        {sidebarHidden && (
          <IconButton label="Show sidebar" shortcut="F9" icon={PanelLeft} onClick={() => setOverlay(true)} />
        )}
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[0.95rem] font-semibold">{title}</h1>
        </div>
        <span className="mr-1 text-xs text-subtle tabular-nums">{items.length}</span>
        <SortMenu />
        <IconButton
          label="New note"
          shortcut="Ctrl+N"
          icon={Plus}
          onClick={() => void createNote()}
          className="bg-accent text-accent-fg hover:bg-accent-strong hover:text-accent-fg"
        />
      </header>

      <SearchField onArrowDown={focusList} onEnter={focusList} />

      {searchText.trim() && scopeLabel && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-lg bg-hover px-2.5 py-1.5 text-xs text-muted">
          <span className="truncate">
            {searchEverywhere ? 'Searching all notes' : `Searching in ${scopeLabel}`}
          </span>
          <button
            type="button"
            className="shrink-0 font-medium text-accent-text hover:underline"
            onClick={() => setSearchEverywhere(!searchEverywhere)}
          >
            {searchEverywhere ? `Only ${scopeLabel}` : 'Search all notes'}
          </button>
        </div>
      )}

      {view.kind === 'trash' && !showingResults && viewNotes.length > 0 && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          <span>Notes here can be restored.</span>
          <Button variant="danger-ghost" size="sm" onClick={() => void emptyTrash()}>
            Empty Trash
          </Button>
        </div>
      )}

      <NoteListMenu notes={items}>
        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={title}
          aria-activedescendant={
            selectedId && items.some((n) => n.id === selectedId) ? `note-${selectedId}` : undefined
          }
          onKeyDown={onListKeyDown}
          className="mt-2 min-h-0 flex-1 overflow-y-auto pb-3 outline-none focus-visible:[&_[aria-selected=true]]:ring-2 focus-visible:[&_[aria-selected=true]]:ring-accent"
        >
          {!loaded ? (
            <div className="flex justify-center pt-10">
              <Spinner />
            </div>
          ) : showingResults ? (
            searchResults.length === 0 ? (
              searching ? (
                <div className="flex justify-center pt-10">
                  <Spinner />
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={`No results for “${searchText.trim()}”`}
                  description={
                    scopeLabel && !searchEverywhere ? (
                      <>
                        Nothing in {scopeLabel} matches.{' '}
                        <button
                          type="button"
                          className="font-medium text-accent-text hover:underline"
                          onClick={() => setSearchEverywhere(true)}
                        >
                          Search all notes
                        </button>
                      </>
                    ) : (
                      'Try fewer or different words. Search looks at titles, text and folder names.'
                    )
                  }
                />
              )
            ) : (
              <div className="flex flex-col gap-0.5">
                {searchResults.map((hit) => (
                  <NoteListItem
                    key={hit.note.id}
                    note={hit.note}
                    selected={hit.note.id === selectedId}
                    showFolder
                    title={<Highlighted value={hit.titleHighlight || hit.note.title || 'Untitled'} />}
                    preview={hit.snippet ? <Highlighted value={hit.snippet} /> : undefined}
                  />
                ))}
              </div>
            )
          ) : viewNotes.length === 0 ? (
            <ViewEmptyState view={view} />
          ) : (
            <div className="flex flex-col gap-0.5">
              {viewNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  selected={note.id === selectedId}
                  showFolder={showFolder}
                />
              ))}
            </div>
          )}
        </div>
      </NoteListMenu>
    </div>
  );
}

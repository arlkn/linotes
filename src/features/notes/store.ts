import { create } from 'zustand';
import type { FolderInfo, LibraryStatus, NoteSummary, SearchHit } from '@/types/domain';
import { sameView, type View } from './views';

/**
 * Library data (note summaries, folders), the current view and selection.
 * Contains no backend calls — see `actions.ts` for operations.
 */
interface LibraryState {
  status: LibraryStatus | null;
  loaded: boolean;
  notes: NoteSummary[];
  folders: FolderInfo[];
  view: View;
  selectedId: string | null;
  searchText: string;
  /** Search results for `searchText`, or null when not searching. */
  searchResults: SearchHit[] | null;
  searching: boolean;
  /** Search all notes instead of just the current view. */
  searchEverywhere: boolean;
  collapsedFolders: Set<string>;

  setStatus(status: LibraryStatus): void;
  setData(notes: NoteSummary[], folders: FolderInfo[]): void;
  setFolders(folders: FolderInfo[]): void;
  upsertNote(note: NoteSummary): void;
  removeNote(id: string): void;
  setView(view: View): void;
  select(id: string | null): void;
  setSearch(
    partial: Partial<Pick<LibraryState, 'searchText' | 'searchResults' | 'searching' | 'searchEverywhere'>>,
  ): void;
  toggleFolderCollapsed(path: string, collapsed?: boolean): void;
}

const COLLAPSED_KEY = 'linotes.collapsedFolders';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export const useLibrary = create<LibraryState>()((set) => ({
  status: null,
  loaded: false,
  notes: [],
  folders: [],
  view: { kind: 'all' },
  selectedId: null,
  searchText: '',
  searchResults: null,
  searching: false,
  searchEverywhere: false,
  collapsedFolders: loadCollapsed(),

  setStatus: (status) => set({ status }),
  setData: (notes, folders) => set({ notes, folders, loaded: true }),
  setFolders: (folders) => set({ folders }),
  upsertNote: (note) =>
    set((state) => {
      const index = state.notes.findIndex((n) => n.id === note.id);
      // Opening a note re-reads it; leave the lists alone when nothing changed.
      if (index !== -1 && sameSummary(state.notes[index]!, note)) return {};
      const notes =
        index === -1 ? [...state.notes, note] : state.notes.map((n, i) => (i === index ? note : n));
      const searchResults =
        state.searchResults?.map((hit) => (hit.note.id === note.id ? { ...hit, note } : hit)) ?? null;
      return { notes, searchResults };
    }),
  removeNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      searchResults: state.searchResults?.filter((hit) => hit.note.id !== id) ?? null,
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),
  setView: (view) => set((state) => (sameView(state.view, view) ? {} : { view, searchEverywhere: false })),
  select: (id) => set({ selectedId: id }),
  setSearch: (partial) => set(partial),
  toggleFolderCollapsed: (path, collapsed) =>
    set((state) => {
      const next = new Set(state.collapsedFolders);
      const shouldCollapse = collapsed ?? !next.has(path);
      if (shouldCollapse) next.add(path);
      else next.delete(path);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Persisting UI state is best-effort.
      }
      return { collapsedFolders: next };
    }),
}));

function sameSummary(a: NoteSummary, b: NoteSummary): boolean {
  return (Object.keys(b) as (keyof NoteSummary)[]).every((key) => a[key] === b[key]);
}

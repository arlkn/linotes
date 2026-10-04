import { isWithinDays } from '@/lib/time';
import type { NoteSummary, SortDirection, SortField } from '@/types/domain';

export type View =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'trash' }
  | { kind: 'folder'; path: string };

export const RECENT_DAYS = 7;

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.path === b.path));
}

export function viewTitle(view: View): string {
  switch (view.kind) {
    case 'all':
      return 'All Notes';
    case 'favorites':
      return 'Favorites';
    case 'recent':
      return 'Recently Edited';
    case 'trash':
      return 'Trash';
    case 'folder':
      return view.path.split('/').pop() || view.path;
  }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Plain code-unit order: right for ISO timestamps and ids, and much faster than `localeCompare`. */
function compareCodes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareNotes(field: SortField, direction: SortDirection) {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: NoteSummary, b: NoteSummary): number => {
    let result: number;
    if (field === 'title') result = collator.compare(a.title || 'Untitled', b.title || 'Untitled');
    else if (field === 'created') result = compareCodes(a.createdAt, b.createdAt);
    else result = compareCodes(a.updatedAt, b.updatedAt);
    return result * sign || compareCodes(a.id, b.id);
  };
}

/** Notes shown for a view, in display order. */
export function notesForView(
  notes: NoteSummary[],
  view: View,
  field: SortField,
  direction: SortDirection,
  now: Date = new Date(),
): NoteSummary[] {
  let result: NoteSummary[];
  switch (view.kind) {
    case 'all':
      result = notes.filter((n) => !n.trashed);
      break;
    case 'favorites':
      result = notes.filter((n) => !n.trashed && n.favorite);
      break;
    case 'recent':
      // Always newest first: that is the point of this view.
      return notes
        .filter((n) => !n.trashed && isWithinDays(n.updatedAt, RECENT_DAYS, now))
        .sort(compareNotes('modified', 'desc'));
    case 'trash':
      return notes
        .filter((n) => n.trashed)
        .sort((a, b) => compareCodes(b.trashedAt ?? '', a.trashedAt ?? '') || compareCodes(a.id, b.id));
    case 'folder':
      result = notes.filter((n) => !n.trashed && n.folder === view.path);
      break;
  }
  return result.sort(compareNotes(field, direction));
}

export interface ViewCounts {
  all: number;
  favorites: number;
  recent: number;
  trash: number;
}

export function countViews(notes: NoteSummary[], now: Date = new Date()): ViewCounts {
  const counts: ViewCounts = { all: 0, favorites: 0, recent: 0, trash: 0 };
  for (const note of notes) {
    if (note.trashed) {
      counts.trash += 1;
      continue;
    }
    counts.all += 1;
    if (note.favorite) counts.favorites += 1;
    if (isWithinDays(note.updatedAt, RECENT_DAYS, now)) counts.recent += 1;
  }
  return counts;
}

/** Search scope that matches the current view. */
export function searchScopeFor(view: View): {
  scope: 'all' | 'favorites' | 'folder' | 'trash';
  folder: string | null;
} {
  switch (view.kind) {
    case 'favorites':
      return { scope: 'favorites', folder: null };
    case 'trash':
      return { scope: 'trash', folder: null };
    case 'folder':
      return { scope: 'folder', folder: view.path };
    default:
      return { scope: 'all', folder: null };
  }
}

import { HIGHLIGHT_END, HIGHLIGHT_START } from '@/features/search/highlight';
import { fold } from '@/lib/fold';
import type { NoteSummary } from '@/types/domain';
import { compareNotes } from './views';

/**
 * Finding notes by title for the quick switcher (Ctrl+P). Unlike search, this
 * runs in the interface on the summaries it already has, as you type.
 */

export interface SwitcherMatch {
  note: NoteSummary;
  /** The title with matched letters wrapped in highlight markers. */
  title: string;
}

/** [start, end) in the folded title. */
type Range = [number, number];

// How a note matched, best first.
const TITLE_START = 0;
const WORD_START = 1;
const ANYWHERE = 2;
const ALL_WORDS = 3;
const LETTERS_IN_ORDER = 4;
const FOLDER = 5;

const displayTitle = (note: NoteSummary) => note.title || 'Untitled';

/**
 * Prepare `notes` (folding each title once) and return a function that ranks
 * them for a query. An empty query lists the most recently edited notes.
 */
export function createNoteMatcher(notes: NoteSummary[]): (query: string, limit?: number) => SwitcherMatch[] {
  const entries = notes
    .filter((note) => !note.trashed)
    .sort(compareNotes('modified', 'desc'))
    .map((note) => ({ note, title: fold(displayTitle(note)), folder: fold(note.folder) }));

  return (query, limit = 50) => {
    const wanted = fold(query).trim().replace(/\s+/g, ' ');
    if (!wanted) return entries.slice(0, limit).map(({ note }) => ({ note, title: displayTitle(note) }));

    const matches: { note: NoteSummary; tier: number; ranges: Range[] }[] = [];
    for (const { note, title, folder } of entries) {
      const match = matchTitle(title, wanted);
      if (match) matches.push({ note, ...match });
      else if (folder.includes(wanted)) matches.push({ note, tier: FOLDER, ranges: [] });
    }
    // A stable sort, so equally good matches stay newest first.
    matches.sort((a, b) => a.tier - b.tier);
    return matches
      .slice(0, limit)
      .map(({ note, ranges }) => ({ note, title: highlight(displayTitle(note), ranges) }));
  };
}

function matchTitle(title: string, query: string): { tier: number; ranges: Range[] } | null {
  if (title.startsWith(query)) return { tier: TITLE_START, ranges: [[0, query.length]] };
  const word = wordStart(title, query);
  if (word >= 0) return { tier: WORD_START, ranges: [[word, word + query.length]] };
  const index = title.indexOf(query);
  if (index >= 0) return { tier: ANYWHERE, ranges: [[index, index + query.length]] };

  const words = query.split(' ');
  if (words.length > 1) {
    const ranges = words.map((w): Range | null => {
      const at = title.indexOf(w);
      return at >= 0 ? [at, at + w.length] : null;
    });
    if (ranges.every((r) => r !== null)) return { tier: ALL_WORDS, ranges };
  }

  const letters = lettersInOrder(title, query.replace(/ /g, ''));
  return letters ? { tier: LETTERS_IN_ORDER, ranges: letters } : null;
}

/** Where `query` starts a word in `text`, or -1. */
function wordStart(text: string, query: string): number {
  for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!)) return at;
  }
  return -1;
}

/** The letters of `query` found one after another in `text` ("wkpl" in "weekly planning"). */
function lettersInOrder(text: string, query: string): Range[] | null {
  const ranges: Range[] = [];
  let from = 0;
  for (const letter of query) {
    const at = text.indexOf(letter, from);
    if (at < 0) return null;
    const last = ranges.at(-1);
    if (last && last[1] === at) last[1] = at + letter.length;
    else ranges.push([at, at + letter.length]);
    from = at + letter.length;
  }
  return ranges;
}

/** Wrap the characters of `title` covered by `ranges` (positions in its folded form) in markers. */
function highlight(title: string, ranges: Range[]): string {
  if (ranges.length === 0) return title;
  const chars = [...title];
  const pieces = chars.map(fold);
  // Folding changed characters in context (rare); show the title without highlights.
  if (pieces.join('') !== fold(title)) return title;

  const marked: boolean[] = [];
  let offset = 0;
  pieces.forEach((piece, i) => {
    const end = offset + piece.length;
    // Accents folded away belong to the letter before them.
    marked[i] = piece ? ranges.some(([s, e]) => offset < e && end > s) : (marked[i - 1] ?? false);
    offset = end;
  });

  let out = '';
  let open = false;
  chars.forEach((char, i) => {
    if (marked[i] !== open) {
      open = marked[i]!;
      out += open ? HIGHLIGHT_START : HIGHLIGHT_END;
    }
    out += char;
  });
  return open ? out + HIGHLIGHT_END : out;
}

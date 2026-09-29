import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@/types/domain';
import { countViews, notesForView, searchScopeFor } from './views';
import { buildFolderTree, flattenTree } from './folder-tree';

const now = new Date('2026-09-29T12:00:00Z');

function note(id: string, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: id,
    preview: '',
    folder: '',
    favorite: false,
    trashed: false,
    trashedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const notes = [
  note('b', {
    title: 'banana',
    updatedAt: '2026-09-29T10:00:00Z',
    createdAt: '2026-01-02T00:00:00Z',
    favorite: true,
  }),
  note('a', {
    title: 'Apple',
    updatedAt: '2026-09-20T10:00:00Z',
    createdAt: '2026-01-03T00:00:00Z',
    folder: 'Work',
  }),
  note('c', {
    title: 'cherry 10',
    updatedAt: '2026-09-28T10:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    folder: 'Work/Sub',
  }),
  note('t', { trashed: true, trashedAt: '2026-09-29T09:00:00Z', folder: 'Work' }),
];

const ids = (list: NoteSummary[]) => list.map((n) => n.id);

describe('notesForView', () => {
  it('filters by view', () => {
    expect(ids(notesForView(notes, { kind: 'all' }, 'modified', 'desc', now))).toEqual(['b', 'c', 'a']);
    expect(ids(notesForView(notes, { kind: 'favorites' }, 'modified', 'desc', now))).toEqual(['b']);
    expect(ids(notesForView(notes, { kind: 'trash' }, 'modified', 'desc', now))).toEqual(['t']);
    expect(ids(notesForView(notes, { kind: 'folder', path: 'Work' }, 'modified', 'desc', now))).toEqual([
      'a',
    ]);
  });

  it('recent view shows the last week, newest first, ignoring the sort setting', () => {
    expect(ids(notesForView(notes, { kind: 'recent' }, 'title', 'asc', now))).toEqual(['b', 'c']);
  });

  it('sorts by title (natural, case-insensitive), created and modified', () => {
    expect(ids(notesForView(notes, { kind: 'all' }, 'title', 'asc', now))).toEqual(['a', 'b', 'c']);
    expect(ids(notesForView(notes, { kind: 'all' }, 'created', 'asc', now))).toEqual(['c', 'b', 'a']);
    expect(ids(notesForView(notes, { kind: 'all' }, 'modified', 'asc', now))).toEqual(['a', 'c', 'b']);
  });

  it('counts views', () => {
    expect(countViews(notes, now)).toEqual({ all: 3, favorites: 1, recent: 2, trash: 1 });
  });

  it('maps views to search scopes', () => {
    expect(searchScopeFor({ kind: 'folder', path: 'Work' })).toEqual({ scope: 'folder', folder: 'Work' });
    expect(searchScopeFor({ kind: 'recent' })).toEqual({ scope: 'all', folder: null });
  });
});

describe('folder tree', () => {
  const folders = [
    { path: 'Work/Sub', name: 'Sub', parent: 'Work', noteCount: 0 },
    { path: 'Work', name: 'Work', parent: '', noteCount: 1 },
    { path: 'archive', name: 'archive', parent: '', noteCount: 0 },
  ];

  it('nests and sorts folders', () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.folder.path)).toEqual(['archive', 'Work']);
    expect(tree[1]!.children[0]!.depth).toBe(1);
    expect(flattenTree(tree, new Set()).map((n) => n.folder.path)).toEqual(['archive', 'Work', 'Work/Sub']);
    expect(flattenTree(tree, new Set(['Work'])).map((n) => n.folder.path)).toEqual(['archive', 'Work']);
  });
});

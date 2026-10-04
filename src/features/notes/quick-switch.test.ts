import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@/types/domain';
import { createNoteMatcher } from './quick-switch';

let counter = 0;
function note(title: string, extra: Partial<NoteSummary> = {}): NoteSummary {
  counter += 1;
  return {
    id: `n${counter}`,
    title,
    preview: '',
    folder: '',
    favorite: false,
    trashed: false,
    trashedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: `2026-01-01T00:00:${String(counter).padStart(2, '0')}Z`,
    ...extra,
  };
}

const titles = (matches: { title: string }[]) => matches.map((m) => m.title);
const mark = (text: string) => `\u0002${text}\u0003`;

describe('quick switcher matching', () => {
  it('lists recent notes for an empty query, without the trash', () => {
    const notes = [note('Older'), note('Newer'), note('Deleted', { trashed: true })];
    expect(titles(createNoteMatcher(notes)(''))).toEqual(['Newer', 'Older']);
    expect(createNoteMatcher(notes)('', 1)).toHaveLength(1);
  });

  it('ranks title starts, then word starts, then anywhere, then letters in order', () => {
    const notes = [
      note('Weekly planning'),
      note('Plans for 2027'),
      note('Explanation'),
      note('Pull list announcement'),
    ];
    const match = createNoteMatcher(notes);
    expect(titles(match('plan'))).toEqual([
      `${mark('Plan')}s for 2027`,
      `Weekly ${mark('plan')}ning`,
      `Ex${mark('plan')}ation`,
      `${mark('P')}u${mark('l')}l list ${mark('an')}nouncement`,
    ]);
  });

  it('matches words in any order and folder names last', () => {
    const notes = [note('Weekly planning'), note('Budget', { folder: 'Work/Planning' })];
    const match = createNoteMatcher(notes);
    expect(titles(match('plan week'))).toEqual([`${mark('Week')}ly ${mark('plan')}ning`]);
    expect(titles(match('work'))).toEqual(['Budget']);
  });

  it('ignores case and accents, including Turkish ı and İ', () => {
    const notes = [note('Café notes'), note('Işık ve İstanbul')];
    const match = createNoteMatcher(notes);
    expect(titles(match('cafe'))).toEqual([`${mark('Café')} notes`]);
    expect(titles(match('ISIK'))).toEqual([`${mark('Işık')} ve İstanbul`]);
    expect(titles(match('istanbul'))).toEqual([`Işık ve ${mark('İstanbul')}`]);
  });

  it('keeps newer notes first among equal matches and finds nothing for unrelated text', () => {
    const notes = [note('Meeting A'), note('Meeting B')];
    const match = createNoteMatcher(notes);
    expect(match('meet').map((m) => m.note.title)).toEqual(['Meeting B', 'Meeting A']);
    expect(match('zzz')).toEqual([]);
  });

  it('shows untitled notes by name', () => {
    expect(titles(createNoteMatcher([note('')])('unt'))).toEqual([`${mark('Unt')}itled`]);
  });
});

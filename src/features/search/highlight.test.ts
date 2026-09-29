import { describe, expect, it } from 'vitest';
import { parseHighlight } from './highlight';

describe('parseHighlight', () => {
  it('splits marked matches', () => {
    expect(parseHighlight('a \u0002match\u0003 b')).toEqual([
      { text: 'a ', match: false },
      { text: 'match', match: true },
      { text: ' b', match: false },
    ]);
  });

  it('keeps HTML as text', () => {
    expect(parseHighlight('<img src=x onerror=alert(1)>')).toEqual([
      { text: '<img src=x onerror=alert(1)>', match: false },
    ]);
  });
});

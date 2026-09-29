import { describe, expect, it } from 'vitest';
import { countText, markdownToPlainText } from './stats';

describe('countText', () => {
  it('counts words and characters', () => {
    expect(countText('Hello, world!')).toEqual({ words: 2, characters: 13 });
    expect(countText('')).toEqual({ words: 0, characters: 0 });
    expect(countText('line one\nline two')).toEqual({ words: 4, characters: 16 });
  });

  it('handles non-English text', () => {
    expect(countText('Çalışma günü özeti').words).toBe(3);
  });
});

describe('markdownToPlainText', () => {
  it('removes common syntax', () => {
    expect(markdownToPlainText('# Title\n\n- [ ] **task** with [link](https://x.y)')).toBe(
      'Title\n\ntask with link',
    );
  });
});

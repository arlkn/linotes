import { describe, expect, it } from 'vitest';
import { keyName, matches } from './match';

const event = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('shortcut matching', () => {
  it('matches layout characters', () => {
    expect(matches(event({ key: 'n', code: 'KeyN', ctrlKey: true }), { key: 'n', ctrl: true })).toBe(true);
    expect(
      matches(event({ key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true }), {
        key: 'n',
        ctrl: true,
        shift: true,
      }),
    ).toBe(true);
    expect(matches(event({ key: 'n', code: 'KeyN' }), { key: 'n', ctrl: true })).toBe(false);
    expect(
      matches(event({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true }), { key: 'n', ctrl: true }),
    ).toBe(false);
  });

  it('falls back to the physical key for non-Latin layouts', () => {
    expect(keyName(event({ key: 'т', code: 'KeyN' }))).toBe('n');
    expect(keyName(event({ key: 'ı', code: 'KeyI' }))).toBe('i');
    expect(keyName(event({ key: 'F9', code: 'F9' }))).toBe('F9');
  });
});

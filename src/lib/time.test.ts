import { describe, expect, it } from 'vitest';
import { formatListTime } from './time';

describe('formatListTime', () => {
  const now = new Date('2026-09-29T15:00:00');
  it('uses relative labels for recent times', () => {
    expect(formatListTime('2026-09-29T14:59:30', now)).toBe('Just now');
    expect(formatListTime('2026-09-29T14:30:00', now)).toBe('30 min ago');
    expect(formatListTime('2026-09-28T09:00:00', now)).toBe('Yesterday');
  });

  it('shows dates for older notes and ignores invalid input', () => {
    expect(formatListTime('2025-01-05T09:00:00', now)).toMatch(/2025/);
    expect(formatListTime('not a date', now)).toBe('');
  });
});

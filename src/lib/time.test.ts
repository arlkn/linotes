import { describe, expect, it } from 'vitest';
import { formatFullTime, formatListTime } from './time';

describe('formatListTime', () => {
  const now = new Date('2026-09-29T15:00:00');
  it('uses relative labels for recent times', () => {
    expect(formatListTime('2026-09-29T14:59:30', now)).toBe('Just now');
    expect(formatListTime('2026-09-29T14:30:00', now)).toBe('30 min ago');
    expect(formatListTime('2026-09-28T09:00:00', now)).toBe('Yesterday');
  });

  it('shows the time for earlier today', () => {
    expect(formatListTime('2026-09-29T09:05:00', now)).toMatch(/09[:.]05/);
  });

  it('shows dates for older notes and ignores invalid input', () => {
    expect(formatListTime('2025-01-05T09:00:00', now)).toMatch(/2025/);
    expect(formatListTime('not a date', now)).toBe('');
  });
});

describe('formatFullTime', () => {
  it('shows the date and time, and the same result every time', () => {
    const text = formatFullTime('2025-01-05T09:05:00');
    expect(text).toMatch(/2025/);
    expect(text).toMatch(/09[:.]05/);
    expect(formatFullTime('2025-01-05T09:05:00')).toBe(text);
    expect(formatFullTime('not a date')).toBe('');
  });
});

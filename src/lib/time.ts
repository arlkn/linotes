const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The interface is in English, so dates are formatted in English too, keeping
 * the user's regional conventions (24-hour clock, day/month order) when known.
 */
function locale(): string {
  const system = typeof navigator !== 'undefined' ? navigator.language : 'en';
  try {
    const region = new Intl.Locale(system).maximize().region;
    const candidate = region ? `en-${region}` : 'en';
    return Intl.DateTimeFormat.supportedLocalesOf([candidate]).length > 0 ? candidate : 'en';
  } catch {
    return 'en';
  }
}

/** Compact timestamp for lists: "Just now", "5 min ago", "14:32", "Yesterday", "3 Mar", "3 Mar 2024". */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < MINUTE) return 'Just now';
  if (diff >= 0 && diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) {
    return date.toLocaleTimeString(locale(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: systemUses12Hour(),
    });
  }
  if (date.getTime() >= startOfToday - DAY) return 'Yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Whether the user's own locale uses a 12-hour clock (the English UI follows it). */
function systemUses12Hour(): boolean {
  try {
    const system = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
    const cycle = new Intl.DateTimeFormat(system, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12';
  } catch {
    return false;
  }
}

/** Full timestamp for tooltips and the status bar. */
export function formatFullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: systemUses12Hour(),
  });
}

/** Relative phrase such as "2 minutes ago" for the status bar. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  return formatFullTime(iso);
}

export function isWithinDays(iso: string, days: number, now: Date = new Date()): boolean {
  const date = new Date(iso).getTime();
  return !Number.isNaN(date) && now.getTime() - date <= days * DAY;
}

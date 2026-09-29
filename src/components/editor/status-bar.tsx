import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { formatFullTime, formatRelative } from '@/lib/time';
import { useEditorStore } from '@/features/editor/store';

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SaveIndicator() {
  const { status, error } = useEditorStore(useShallow((s) => ({ status: s.status, error: s.error })));
  const save = useEditorStore((s) => s.save);
  const common = 'flex items-center gap-1.5';
  switch (status) {
    case 'saving':
      return (
        <span className={common}>
          <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2} /> Saving…
        </span>
      );
    case 'dirty':
      return (
        <span className={common}>
          <span className="size-2 rounded-full bg-accent" aria-hidden /> Unsaved changes
        </span>
      );
    case 'error':
      return (
        <span className={cn(common, 'text-danger')} title={error ?? undefined}>
          <TriangleAlert className="size-3.5" strokeWidth={2} /> Couldn’t save
          <button type="button" className="font-medium underline" onClick={() => void save()}>
            Retry
          </button>
        </span>
      );
    case 'conflict':
      return (
        <span className={cn(common, 'text-warning')}>
          <TriangleAlert className="size-3.5" strokeWidth={2} /> Changed on disk
        </span>
      );
    case 'missing':
      return (
        <span className={cn(common, 'text-warning')}>
          <TriangleAlert className="size-3.5" strokeWidth={2} /> File missing
        </span>
      );
    default:
      return (
        <span className={common}>
          <CircleCheck className="size-3.5" strokeWidth={2} /> Saved
        </span>
      );
  }
}

export function StatusBar() {
  const { stats, updatedAt, mode } = useEditorStore(
    useShallow((s) => ({
      stats: s.stats,
      updatedAt: s.session?.updatedAt ?? null,
      mode: s.session?.mode ?? 'rich',
    })),
  );
  const now = useNow(30_000);
  return (
    <footer
      className="flex h-8 shrink-0 items-center gap-3 border-t border-line px-4 text-xs text-muted"
      aria-label="Note status"
    >
      <span className="tabular-nums">
        {stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'} ·{' '}
        {stats.characters.toLocaleString()} {stats.characters === 1 ? 'character' : 'characters'}
      </span>
      <span className="hidden text-subtle sm:inline">{mode === 'markdown' ? 'Markdown' : 'Rich text'}</span>
      <span className="flex-1" />
      <span aria-live="polite">
        <SaveIndicator />
      </span>
      {updatedAt && (
        <time dateTime={updatedAt} title={formatFullTime(updatedAt)} className="hidden md:inline">
          Edited {formatRelative(updatedAt, now)}
        </time>
      )}
    </footer>
  );
}

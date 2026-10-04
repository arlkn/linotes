import { Star } from 'lucide-react';
import { memo, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatFullTime, formatListTime } from '@/lib/time';
import { folderLabel } from '@/features/notes/folder-tree';
import { selectNote } from '@/features/notes/actions';
import { NOTE_DRAG_TYPE } from '@/components/sidebar/drag';
import type { NoteSummary } from '@/types/domain';

interface NoteListItemProps {
  note: NoteSummary;
  selected: boolean;
  showFolder: boolean;
  /** Replaces the title/preview (search highlights). */
  title?: ReactNode;
  preview?: ReactNode;
}

/** "Just now" → "just now", but keep dates like "3 Mar" as they are. */
function relativePhrase(label: string): string {
  return label === 'Just now' || label === 'Yesterday' || label.endsWith('ago') ? label.toLowerCase() : label;
}

export const NoteListItem = memo(function NoteListItem({
  note,
  selected,
  showFolder,
  title,
  preview,
}: NoteListItemProps) {
  const time = note.trashed && note.trashedAt ? note.trashedAt : note.updatedAt;

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
    event.dataTransfer.setData('text/plain', note.title || 'Untitled');
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      id={`note-${note.id}`}
      data-note-id={note.id}
      role="option"
      aria-selected={selected}
      draggable={!note.trashed}
      onDragStart={onDragStart}
      onClick={() => void selectNote(note.id)}
      className={cn(
        'relative mx-2 flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_4.5rem]',
        selected ? 'bg-accent-soft' : 'hover:bg-hover',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('min-w-0 flex-1 truncate font-semibold', !note.title && 'text-muted italic')}>
          {title ?? (note.title || 'Untitled')}
        </span>
        {note.favorite && !note.trashed && (
          <Star className="size-3.5 shrink-0 fill-accent text-accent" strokeWidth={2} aria-label="Favorite" />
        )}
      </div>
      <p className="line-clamp-2 min-h-[1.2rem] text-[0.8125rem] leading-snug text-muted">
        {preview ?? (note.preview || <span className="text-subtle">No additional text</span>)}
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-subtle">
        <time dateTime={time} title={formatFullTime(time)} className="shrink-0">
          {note.trashed ? `Deleted ${relativePhrase(formatListTime(time))}` : formatListTime(time)}
        </time>
        {showFolder && note.folder && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{folderLabel(note.folder)}</span>
          </>
        )}
      </div>
    </div>
  );
});

import { useState, type ComponentType, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { draggedNoteId, isNoteDrag } from './drag';

interface SidebarItemProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  active?: boolean;
  onSelect: () => void;
  /** Accept notes dropped on this item. */
  onDropNote?: (id: string) => void;
  indent?: number;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function SidebarItem({
  icon: Icon,
  label,
  count,
  active,
  onSelect,
  onDropNote,
  indent = 0,
  leading,
  trailing,
}: SidebarItemProps) {
  const [dropping, setDropping] = useState(false);

  const dropHandlers = onDropNote
    ? {
        onDragOver: (event: DragEvent) => {
          if (!isNoteDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropping(true);
        },
        onDragLeave: () => setDropping(false),
        onDrop: (event: DragEvent) => {
          setDropping(false);
          const id = draggedNoteId(event);
          if (id) {
            event.preventDefault();
            onDropNote(id);
          }
        },
      }
    : {};

  return (
    <div
      className={cn(
        'group relative flex h-8 items-center rounded-lg text-sm transition-colors',
        active ? 'bg-active font-medium text-fg' : 'text-fg/90 hover:bg-hover',
        dropping && 'bg-accent-soft ring-2 ring-accent ring-inset',
      )}
      style={{ paddingLeft: `${0.375 + indent * 0.875}rem` }}
      {...dropHandlers}
    >
      {leading}
      <button
        type="button"
        data-nav-item
        aria-label={count ? `${label} (${count})` : label}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg pr-2 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon
          className={cn('size-[1.05rem] shrink-0', active ? 'text-accent-text' : 'text-muted')}
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              'text-xs tabular-nums',
              active ? 'text-fg/70' : 'text-subtle',
              trailing && 'group-hover:hidden',
            )}
          >
            {count}
          </span>
        )}
      </button>
      {trailing && (
        <div className="absolute right-1 hidden group-focus-within:flex group-hover:flex">{trailing}</div>
      )}
    </div>
  );
}

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Called continuously while dragging. */
  onChange: (value: number) => void;
  /** Called once when the user finishes resizing. */
  onCommit: (value: number) => void;
  /** CSS pixels per unit of `value` (the interface zoom factor). */
  scale?: number;
}

/** A draggable vertical splitter between panes (also keyboard adjustable). */
export function ResizeHandle({ label, value, min, max, onChange, onCommit, scale = 1 }: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startValue: number; latest: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startValue: value, latest: value };
    document.body.style.cursor = 'col-resize';
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = clamp(drag.current.startValue + (event.clientX - drag.current.startX) / scale);
    drag.current.latest = next;
    onChange(next);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    const final = drag.current.latest;
    drag.current = null;
    document.body.style.cursor = '';
    onCommit(final);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = clamp(value + (event.key === 'ArrowRight' ? step : -step));
      onChange(next);
      onCommit(next);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:left-[3px] after:w-px after:bg-line after:transition-colors',
        'hover:after:bg-line-strong focus-visible:after:w-[2px] focus-visible:after:bg-accent',
      )}
    />
  );
}

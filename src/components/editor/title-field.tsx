import { useEffect, useLayoutEffect, useRef } from 'react';
import { useEditorStore, type EditorSession } from '@/features/editor/store';

/** The note title: a wrapping, auto-growing single-paragraph field. */
export function TitleField({ session, onEnter }: { session: EditorSession; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const setTitle = useEditorStore((s) => s.setTitle);
  const focusRequest = useEditorStore((s) => s.focusRequest);

  // Grow with the text; re-measure when the width changes (window resize, zoom, pane drag).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let lastWidth = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      // Resize outside the observer callback to avoid a ResizeObserver loop.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [session.title]);

  useEffect(() => {
    if (focusRequest?.target === 'title') {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusRequest]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={session.title}
      readOnly={session.trashed}
      placeholder="Untitled"
      aria-label="Note title"
      spellCheck={false}
      maxLength={500}
      onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' ||
          (e.key === 'ArrowDown' && e.currentTarget.selectionStart === e.currentTarget.value.length)
        ) {
          e.preventDefault();
          onEnter();
        }
      }}
      className="block w-full resize-none overflow-hidden bg-transparent text-[1.9em] leading-tight font-bold tracking-tight text-fg outline-none placeholder:text-subtle/70"
      style={{ fontSize: 'calc(var(--ln-editor-font-size) * 1.9)' }}
    />
  );
}

import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Kbd, TextInput } from '@/components/ui/controls';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { goToNote } from '@/features/notes/actions';
import { folderLabel } from '@/features/notes/folder-tree';
import { createNoteMatcher } from '@/features/notes/quick-switch';
import { useLibrary } from '@/features/notes/store';
import { useUi } from '@/features/ui/ui-store';
import { Highlighted } from './highlight';

const PAGE = 8;

/** Ctrl+P: open any note by typing part of its title. */
export function QuickSwitcher() {
  const open = useUi((s) => s.quickSwitcherOpen);
  const setOpen = useUi((s) => s.setQuickSwitcherOpen);
  const picked = useRef(false);

  const pick = (id: string) => {
    picked.current = true;
    setOpen(false);
    void goToNote(id);
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Go to Note"
      hideTitle
      // Anchored near the top, so the box doesn't move as the list changes length.
      className="mt-[12vh] max-w-lg self-start"
      onCloseAutoFocus={(event) => {
        // The picked note's text gets the focus, not whatever had it before.
        if (picked.current) event.preventDefault();
        picked.current = false;
      }}
    >
      <SwitcherBody onPick={pick} />
    </Modal>
  );
}

function SwitcherBody({ onPick }: { onPick: (id: string) => void }) {
  const notes = useLibrary((s) => s.notes);
  const match = useMemo(() => createNoteMatcher(notes), [notes]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => match(query), [match, query]);
  const activeId = results[active]?.note.id;

  useEffect(() => {
    if (activeId) document.getElementById(`switch-${activeId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const onKeyDown = (event: KeyboardEvent) => {
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.max(0, Math.min(results.length - 1, to)));
    };
    if (event.key === 'ArrowDown') move(active + 1);
    else if (event.key === 'ArrowUp') move(active - 1);
    else if (event.key === 'PageDown') move(active + PAGE);
    else if (event.key === 'PageUp') move(active - PAGE);
    else if (event.key === 'Enter' && activeId) {
      event.preventDefault();
      onPick(activeId);
    }
  };

  return (
    <>
      <div className="relative px-3 pt-3">
        <Search
          className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-[calc(50%-0.375rem)] text-subtle"
          strokeWidth={1.9}
        />
        <TextInput
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Go to note…"
          aria-label="Go to note"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="ln-switcher-results"
          aria-activedescendant={activeId ? `switch-${activeId}` : undefined}
          spellCheck={false}
          autoComplete="off"
          className="h-10 pl-9"
        />
      </div>
      <div
        id="ln-switcher-results"
        role="listbox"
        aria-label="Notes"
        className="mt-2 max-h-[min(24rem,55vh)] overflow-y-auto px-2 pb-2"
      >
        {results.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">
            {query.trim() ? `No note titles match “${query.trim()}”` : 'No notes yet'}
          </p>
        )}
        {results.map(({ note, title }, i) => (
          <div
            key={note.id}
            id={`switch-${note.id}`}
            role="option"
            aria-selected={i === active}
            // Not onMouseEnter: rows scrolling under a still pointer must not take over.
            onMouseMove={() => setActive(i)}
            onClick={() => onPick(note.id)}
            className={cn(
              'flex h-9 items-center gap-3 rounded-lg px-3 text-sm',
              i === active && 'bg-accent-soft',
            )}
          >
            <span className={cn('min-w-0 flex-1 truncate font-medium', !note.title && 'text-muted italic')}>
              <Highlighted value={title} />
            </span>
            {note.folder && (
              <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">
                {folderLabel(note.folder)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted">
        <Hint keys={['↑', '↓']}>to move</Hint>
        <Hint keys={['Enter']}>to open</Hint>
        <Hint keys={['Esc']}>to close</Hint>
      </div>
    </>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="ml-0.5">{children}</span>
    </span>
  );
}

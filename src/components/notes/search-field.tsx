import { Search, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { clearSearch, runSearch } from '@/features/notes/actions';
import { useLibrary } from '@/features/notes/store';
import { useUi } from '@/features/ui/ui-store';

const DEBOUNCE_MS = 140;

export function SearchField({ onArrowDown, onEnter }: { onArrowDown: () => void; onEnter: () => void }) {
  const text = useLibrary((s) => s.searchText);
  const setSearch = useLibrary((s) => s.setSearch);
  const focusNonce = useUi((s) => s.searchFocusNonce);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusNonce > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusNonce]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (value: string) => {
    setSearch({ searchText: value });
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      clearSearch();
      return;
    }
    timer.current = setTimeout(() => void runSearch(value), DEBOUNCE_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (text) {
        event.preventDefault();
        event.stopPropagation();
        onChange('');
      } else {
        onArrowDown();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onArrowDown();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (timer.current) {
        clearTimeout(timer.current);
        void runSearch(text).then(onEnter);
      } else {
        onEnter();
      }
    }
  };

  return (
    <div className="relative mx-3">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle"
        strokeWidth={1.9}
      />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search notes"
        aria-label="Search notes"
        spellCheck={false}
        autoComplete="off"
        className="h-8 w-full rounded-lg border border-transparent bg-hover pr-8 pl-8 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent-soft [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-active hover:text-fg"
        >
          <X className="size-3.5" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

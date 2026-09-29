import { parseHighlight } from '@/features/search/highlight';

/** Renders search highlights as <mark>. Text is never interpreted as HTML. */
export function Highlighted({ value }: { value: string }) {
  return (
    <>
      {parseHighlight(value).map((part, i) =>
        part.match ? (
          <mark key={i} className="ln-mark">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

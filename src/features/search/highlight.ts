export const HIGHLIGHT_START = '\u0002';
export const HIGHLIGHT_END = '\u0003';

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Split backend-highlighted text (U+0002 … U+0003 markers) into plain and matching parts. */
export function parseHighlight(value: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let match = false;
  let buffer = '';
  const flush = () => {
    if (buffer) parts.push({ text: buffer, match });
    buffer = '';
  };
  for (const ch of value) {
    if (ch === HIGHLIGHT_START || ch === HIGHLIGHT_END) {
      flush();
      match = ch === HIGHLIGHT_START;
    } else {
      buffer += ch;
    }
  }
  flush();
  return parts;
}

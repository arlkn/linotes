import type { EditorStats } from './store';

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

/** Word and character counts for plain text (characters exclude line breaks). */
export function countText(text: string): EditorStats {
  let words = 0;
  if (segmenter) {
    for (const segment of segmenter.segment(text)) if (segment.isWordLike) words += 1;
  } else {
    words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }
  let characters = 0;
  for (const ch of text) if (ch !== '\n' && ch !== '\r') characters += 1;
  return { words, characters };
}

/** Approximate readable text of Markdown, for counting in Markdown mode. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^(```|~~~).*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?u>/g, '')
    .replace(/^[ \t]{0,3}(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](\s|$)/g, '$1$2');
}

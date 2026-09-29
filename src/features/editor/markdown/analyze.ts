import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { parseMarkdown } from './parse';
import { editorSchema } from './schema';
import { serializeMarkdown } from './serialize';
import { renderForComparison } from './tokenizer';

export type Analysis = { ok: true; doc: PMNode } | { ok: false; reasons: string[] };

/** Very large notes open in Markdown mode to keep the editor responsive. */
export const RICH_MODE_MAX_CHARS = 400_000;

/**
 * Decide whether a note can be edited in rich mode without changing its
 * meaning. The Markdown is parsed, written back, and both versions are
 * rendered: if the rendering differs, the rich editor would alter the note,
 * so it must be edited as Markdown instead.
 */
export function analyzeMarkdown(markdown: string, schema: Schema = editorSchema()): Analysis {
  if (markdown.length > RICH_MODE_MAX_CHARS) return { ok: false, reasons: ['a very large note'] };
  const parsed = parseMarkdown(markdown, schema);
  if (!parsed.ok) return parsed;
  const rewritten = serializeMarkdown(parsed.doc);
  if (!sameRendering(markdown, rewritten)) {
    return { ok: false, reasons: ['formatting the rich editor would rewrite'] };
  }
  return parsed;
}

export function sameRendering(a: string, b: string): boolean {
  return normalizeHtml(renderForComparison(a)) === normalizeHtml(renderForComparison(b));
}

/** Collapse insignificant whitespace, except inside <pre> where it matters. */
function normalizeHtml(html: string): string {
  return html
    .split(/(<pre[\s\S]*?<\/pre>)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/>\s+</g, '><').replace(/\s+/g, ' ')))
    .join('')
    .trim();
}

/** Human-readable reason list: "tables and HTML". */
export function describeReasons(reasons: string[]): string {
  if (reasons.length <= 1) return reasons[0] ?? '';
  return `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}`;
}

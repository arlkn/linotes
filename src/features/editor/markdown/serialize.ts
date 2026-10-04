import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
  type MarkdownSerializerState,
} from 'prosemirror-markdown';
import { parseMarkdown } from './parse';

/**
 * Editor document → Markdown.
 *
 * Output is kept readable: characters are only escaped where Markdown would
 * otherwise misread them (so `snake_case`, `~/path` and `a * b` stay as
 * typed). Every result is verified by parsing it back; if the document would
 * not survive the round trip, a strictly escaped form is used instead.
 */

/** Internal serializer state fields used here (stable in prosemirror-markdown 1.x). */
interface SerializerInternals {
  atBlockStart: boolean;
  inAutolink?: boolean;
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s/;
const ENTITY = /^&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/;

/** Minimal escaping of inline text. Exported for tests. */
export function escapeInline(text: string, inLink = false): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    switch (ch) {
      case '\\':
        out += next === undefined || ASCII_PUNCTUATION.test(next) ? '\\\\' : '\\';
        break;
      case '`':
        out += '\\`';
        break;
      case '*':
      case '_': {
        const spaced =
          prev !== undefined && next !== undefined && WHITESPACE.test(prev) && WHITESPACE.test(next);
        const intraword =
          ch === '_' &&
          prev !== undefined &&
          next !== undefined &&
          WORD_CHAR.test(prev) &&
          WORD_CHAR.test(next);
        out += spaced || intraword ? ch : `\\${ch}`;
        break;
      }
      case '~':
        out += prev === '~' || next === '~' ? '\\~' : '~';
        break;
      case '[': {
        // Brackets only form links when followed by `(`, `[` or `:`.
        // A bracket at the end of this text node may meet one in the next node.
        const close = text.indexOf(']', i + 1);
        const after = close === -1 ? null : text[close + 1];
        const mayFormLink =
          close !== -1 && (after === undefined || after === '(' || after === '[' || after === ':');
        out += inLink || mayFormLink ? '\\[' : '[';
        break;
      }
      case ']':
        out += inLink ? '\\]' : ']';
        break;
      case '<':
        out += next !== undefined && /[A-Za-z/!?]/.test(next) ? '\\<' : '<';
        break;
      case '&':
        out += ENTITY.test(text.slice(i)) ? '\\&' : '&';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Escape every character that could possibly be read as Markdown syntax. */
export function escapeStrict(text: string): string {
  return text.replace(/[\\`*_~[\]<>&#!|]/g, '\\$&');
}

/** Escape block syntax at the start of a line (headings, lists, quotes, rules). */
export function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)([-+*])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)>/, '$1\\>')
    .replace(/^(\s*\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)([=-]+\s*)$/, '$1\\$2')
    .replace(/^(\s*)\[([ xX])\](?=\s|$)/, '$1\\[$2]');
}

function isBreak(node: PMNode | null): boolean {
  return node !== null && (node.type.name === 'softBreak' || node.type.name === 'hardBreak');
}

function textSerializer(strict: boolean) {
  return (state: MarkdownSerializerState, node: PMNode, parent: PMNode, index: number) => {
    const internals = state as unknown as SerializerInternals;
    let text = node.text ?? '';
    if (internals.inAutolink) {
      state.text(text, false);
      return;
    }
    const prev = index > 0 ? parent.child(index - 1) : null;
    const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
    // Trailing spaces before a line break would turn into a hard break.
    if (next === null || isBreak(next)) text = text.replace(/[ \t]+$/, '');
    const inLink = node.marks.some((mark) => mark.type.name === 'link');
    let escaped = strict ? escapeStrict(text) : escapeInline(text, inLink);
    if (internals.atBlockStart || isBreak(prev)) escaped = escapeLineStart(escaped);
    // A closing run of #s would be read as the end of an ATX heading.
    if (parent.type.name === 'heading' && next === null) escaped = escaped.replace(/(^|\s)(#+)$/, '$1\\$2');
    state.text(escaped, false);
  };
}

function linkClose(state: MarkdownSerializerState, mark: Mark, parent: PMNode, index: number): string {
  const internals = state as unknown as SerializerInternals;
  if (internals.inAutolink) {
    internals.inAutolink = undefined;
    return '>';
  }
  const href = String(mark.attrs.href ?? '');
  const target = /[\s<>]/.test(href)
    ? `<${href.replace(/[<>]/g, encodeURIComponent)}>`
    : href.replace(/[()]/g, '\\$&');
  const title = mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : '';
  void parent;
  void index;
  return `](${target}${title})`;
}

/** Image paths are written as other editors write them: spaces as `%20`. */
export function imageDestination(src: string): string {
  return src.replace(/[\s<>]/g, encodeURIComponent).replace(/[()]/g, '\\$&');
}

function createSerializer(strict: boolean): MarkdownSerializer {
  const defaultLink = defaultMarkdownSerializer.marks.link!;
  return new MarkdownSerializer(
    {
      paragraph(state, node) {
        state.renderInline(node);
        state.closeBlock(node);
      },
      heading(state, node) {
        state.write(`${state.repeat('#', node.attrs.level as number)} `);
        state.renderInline(node, false);
        state.closeBlock(node);
      },
      blockquote(state, node) {
        state.wrapBlock('> ', null, node, () => state.renderContent(node));
      },
      codeBlock(state, node) {
        const runs = node.textContent.match(/`{3,}/gm);
        const fence = runs ? `${runs.sort((a, b) => a.length - b.length).at(-1)}\`` : '```';
        state.write(`${fence}${(node.attrs.language as string | null) ?? ''}\n`);
        state.text(node.textContent, false);
        state.write('\n');
        state.write(fence);
        state.closeBlock(node);
      },
      horizontalRule(state, node) {
        state.write('---');
        state.closeBlock(node);
      },
      bulletList(state, node, parent, index) {
        // Adjacent lists need different markers, or Markdown merges them into one.
        const marker = index > 0 && parent.child(index - 1).type === node.type ? '* ' : '- ';
        state.renderList(node, '  ', () => marker);
      },
      taskList(state, node, parent, index) {
        const marker = index > 0 && parent.child(index - 1).type === node.type ? '* ' : '- ';
        state.renderList(node, '  ', () => marker);
      },
      orderedList(state, node, parent, index) {
        const start = (node.attrs.start as number | null) ?? 1;
        const delimiter = index > 0 && parent.child(index - 1).type === node.type ? ')' : '.';
        const width = String(start + node.childCount - 1).length;
        const indent = state.repeat(' ', width + 2);
        // Numbers are left-aligned as people type them; continuation lines use the widest marker's indent.
        state.renderList(node, indent, (i) => {
          const marker = `${start + i}${delimiter}`;
          return marker + state.repeat(' ', indent.length - marker.length);
        });
      },
      listItem(state, node) {
        state.renderContent(node);
      },
      taskItem(state, node) {
        state.write(node.attrs.checked ? '[x] ' : '[ ] ');
        state.renderContent(node);
      },
      hardBreak(state, node, parent, index) {
        for (let i = index + 1; i < parent.childCount; i++) {
          if (parent.child(i).type !== node.type) {
            state.write('\\\n');
            return;
          }
        }
      },
      softBreak(state, _node, parent, index) {
        if (index + 1 < parent.childCount) state.text('\n', false);
      },
      image(state, node) {
        // Not escaped like link text: Markdown renders alt text without escaped characters.
        const alt = String(node.attrs.alt ?? '');
        const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : '';
        state.write(
          `![${strict ? escapeStrict(alt) : escapeInline(alt)}](${imageDestination(String(node.attrs.src ?? ''))}${title})`,
        );
      },
      text: textSerializer(strict),
    },
    {
      italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
      bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
      strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
      underline: { open: '<u>', close: '</u>', mixable: true, expelEnclosingWhitespace: true },
      code: defaultMarkdownSerializer.marks.code!,
      link: { ...defaultLink, close: linkClose },
    },
    { hardBreakNodeName: 'hardBreak' },
  );
}

const minimalSerializer = createSerializer(false);
const strictSerializer = createSerializer(true);

/** Serialise without verification. Exported for tests. */
export function serializeUnchecked(doc: PMNode, strict = false): string {
  return (strict ? strictSerializer : minimalSerializer).serialize(doc, { tightLists: true });
}

/** Serialise a document as file content (ending with a newline unless empty). */
export function serializeMarkdown(doc: PMNode): string {
  const minimal = serializeUnchecked(doc);
  if (roundTrips(doc, minimal)) return withFinalNewline(minimal);
  const strict = serializeUnchecked(doc, true);
  if (!roundTrips(doc, strict)) {
    console.warn('[linotes] Markdown round-trip check failed; saving the strictly escaped form.');
  }
  return withFinalNewline(strict);
}

function withFinalNewline(markdown: string): string {
  return markdown.trim() ? `${markdown.replace(/\n+$/, '')}\n` : '';
}

function roundTrips(doc: PMNode, markdown: string): boolean {
  const parsed = parseMarkdown(markdown, doc.type.schema);
  return parsed.ok && documentsEquivalent(doc, parsed.doc);
}

type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: unknown[];
  text?: string;
  content?: JsonNode[];
};

/**
 * Compare documents while ignoring what Markdown cannot express: empty
 * paragraphs, whitespace at the edges of lines, and dangling line breaks.
 */
export function documentsEquivalent(a: PMNode, b: PMNode): boolean {
  return (
    JSON.stringify(normalize(a.toJSON() as JsonNode)) === JSON.stringify(normalize(b.toJSON() as JsonNode))
  );
}

function normalize(node: JsonNode): JsonNode {
  const content = node.content;
  if (!content) return node;
  const isInline = content.some((c) => c.type === 'text' || c.type === 'hardBreak' || c.type === 'softBreak');
  if (isInline) return { ...node, content: normalizeInline(content) };
  let children = content.map(normalize);
  const nonEmpty = children.filter((c) => !(c.type === 'paragraph' && (c.content?.length ?? 0) === 0));
  if (nonEmpty.length > 0 || node.type === 'doc') children = nonEmpty;
  return { ...node, content: children };
}

function normalizeInline(content: JsonNode[]): JsonNode[] {
  const isBreakNode = (n: JsonNode | undefined) => n?.type === 'hardBreak' || n?.type === 'softBreak';
  const out: JsonNode[] = [];
  content.forEach((node, i) => {
    if (node.type !== 'text') {
      out.push(node);
      return;
    }
    let text = node.text ?? '';
    if (i === 0 || isBreakNode(content[i - 1])) text = text.replace(/^\s+/, '');
    if (i === content.length - 1 || isBreakNode(content[i + 1])) text = text.replace(/\s+$/, '');
    if (text) out.push({ ...node, text });
  });
  while (isBreakNode(out[0])) out.shift();
  while (isBreakNode(out.at(-1))) out.pop();
  // Merge text nodes that became adjacent with identical marks.
  const merged: JsonNode[] = [];
  for (const node of out) {
    const last = merged.at(-1);
    if (
      last?.type === 'text' &&
      node.type === 'text' &&
      JSON.stringify(last.marks) === JSON.stringify(node.marks)
    ) {
      merged[merged.length - 1] = { ...last, text: (last.text ?? '') + (node.text ?? '') };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

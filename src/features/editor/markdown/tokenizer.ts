import MarkdownIt from 'markdown-it';
import type { StateCore, Token } from 'markdown-it';

/**
 * Markdown dialect used by Linotes: CommonMark + GFM strikethrough + GFM task
 * lists, with underline written as `<u>…</u>` (the form most Markdown tools
 * render). Other raw HTML, tables and images are *detected* but not mapped
 * into the rich editor; notes containing them open in Markdown mode so
 * nothing is lost.
 */

export interface ParseEnv {
  /** Human-readable names of constructs the rich editor cannot represent. */
  unsupported: Set<string>;
}

export const UNSUPPORTED = {
  html: 'HTML',
  tables: 'tables',
  images: 'images',
  mixedTasks: 'lists mixing checkboxes and bullets',
} as const;

const TASK_MARKER = /^\[([ xX])\](?=\s|$)[ \t]?/;

function flag(state: StateCore, what: string): void {
  (state.env as Partial<ParseEnv>).unsupported?.add(what);
}

function taskState(tokens: Token[], itemIndex: number): boolean | null {
  const paragraph = tokens[itemIndex + 1];
  const inline = tokens[itemIndex + 2];
  if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') return null;
  const first = inline.children?.[0];
  if (first?.type !== 'text') return null;
  const match = TASK_MARKER.exec(first.content);
  return match ? match[1] !== ' ' : null;
}

function stripTaskMarker(inline: Token): void {
  inline.content = inline.content.replace(TASK_MARKER, '');
  const children = inline.children ?? [];
  const first = children[0];
  if (first?.type === 'text') {
    first.content = first.content.replace(TASK_MARKER, '');
    if (first.content === '') children.shift();
  }
  // A marker alone on its line leaves a leading soft break behind.
  if (children[0]?.type === 'softbreak') children.shift();
}

/** GFM task lists: `- [ ] todo` / `- [x] done`. */
function taskLists(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]!;
    if (open.type !== 'bullet_list_open') continue;
    const items: number[] = [];
    let close = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j]!;
      if (t.level === open.level && t.type === 'bullet_list_close') {
        close = j;
        break;
      }
      if (t.level === open.level + 1 && t.type === 'list_item_open') items.push(j);
    }
    if (close < 0 || items.length === 0) continue;
    const states = items.map((j) => taskState(tokens, j));
    const taskCount = states.filter((s) => s !== null).length;
    if (taskCount === 0) continue;
    if (taskCount !== items.length) {
      flag(state, UNSUPPORTED.mixedTasks);
      continue;
    }
    open.type = 'task_list_open';
    tokens[close]!.type = 'task_list_close';
    items.forEach((j, k) => {
      const item = tokens[j]!;
      item.type = 'task_item_open';
      item.attrSet('checked', states[k] ? 'true' : 'false');
      for (let m = j + 1; m < close; m++) {
        const t = tokens[m]!;
        if (t.type === 'list_item_close' && t.level === item.level) {
          t.type = 'task_item_close';
          break;
        }
      }
      stripTaskMarker(tokens[j + 2]!);
    });
  }
}

/** Map `<u>`/`</u>` to underline; flag any other HTML, tables and images. */
function htmlAndUnsupported(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type === 'html_block') flag(state, UNSUPPORTED.html);
    if (token.type === 'table_open') flag(state, UNSUPPORTED.tables);
    if (token.type !== 'inline' || !token.children) continue;
    for (const child of token.children) {
      if (child.type === 'image') flag(state, UNSUPPORTED.images);
      if (child.type !== 'html_inline') continue;
      const tag = child.content.trim().toLowerCase();
      if (tag === '<u>') {
        child.type = 'u_open';
        child.tag = 'u';
        child.nesting = 1;
      } else if (tag === '</u>') {
        child.type = 'u_close';
        child.tag = 'u';
        child.nesting = -1;
      } else {
        flag(state, UNSUPPORTED.html);
      }
    }
  }
}

export function createTokenizer(): MarkdownIt {
  const md = new MarkdownIt('commonmark', { html: true, linkify: false, typographer: false });
  md.enable(['strikethrough', 'table']);
  md.core.ruler.push('linotes_task_lists', taskLists);
  md.core.ruler.push('linotes_html', htmlAndUnsupported);
  return md;
}

export const tokenizer = createTokenizer();

/** Render Markdown to an HTML string for comparison only (never inserted into the DOM). */
export function renderForComparison(markdown: string): string {
  return tokenizer.render(markdown, { unsupported: new Set() } satisfies ParseEnv);
}

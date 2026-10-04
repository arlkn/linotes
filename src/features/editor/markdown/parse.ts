import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import type { Token } from 'markdown-it';
import { MarkdownParser } from 'prosemirror-markdown';
import { normalizeImageSrc, tokenizer, type ParseEnv } from './tokenizer';

export type ParseResult = { ok: true; doc: PMNode } | { ok: false; reasons: string[] };

function listIsTight(tokens: Token[], index: number): boolean {
  for (let i = index + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'list_item_open' && token.type !== 'task_item_open') return token.hidden;
  }
  return false;
}

const parsers = new WeakMap<Schema, MarkdownParser>();

function parserFor(schema: Schema): MarkdownParser {
  let parser = parsers.get(schema);
  if (!parser) {
    parser = new MarkdownParser(schema, tokenizer, {
      blockquote: { block: 'blockquote' },
      paragraph: { block: 'paragraph' },
      list_item: { block: 'listItem' },
      task_item: {
        block: 'taskItem',
        getAttrs: (token) => ({ checked: token.attrGet('checked') === 'true' }),
      },
      bullet_list: { block: 'bulletList', getAttrs: (_t, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
      task_list: { block: 'taskList', getAttrs: (_t, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
      ordered_list: {
        block: 'orderedList',
        getAttrs: (token, tokens, i) => ({
          start: Number(token.attrGet('start') ?? 1),
          tight: listIsTight(tokens, i),
        }),
      },
      heading: { block: 'heading', getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
      code_block: { block: 'codeBlock', noCloseToken: true },
      fence: {
        block: 'codeBlock',
        getAttrs: (token) => ({ language: token.info.trim() || null }),
        noCloseToken: true,
      },
      hr: { node: 'horizontalRule' },
      hardbreak: { node: 'hardBreak' },
      softbreak: { node: 'softBreak' },
      em: { mark: 'italic' },
      strong: { mark: 'bold' },
      s: { mark: 'strike' },
      u: { mark: 'underline' },
      link: {
        mark: 'link',
        getAttrs: (token) => ({ href: token.attrGet('href'), title: token.attrGet('title') || null }),
      },
      code_inline: { mark: 'code', noCloseToken: true },
      image: {
        node: 'image',
        getAttrs: (token) => ({
          src: normalizeImageSrc(token.attrGet('src') ?? ''),
          // The alt text exactly as Markdown renders it.
          alt: tokenizer.renderer.renderInlineAsText(token.children ?? [], tokenizer.options, {}) || null,
          title: token.attrGet('title') || null,
        }),
      },
    });
    parsers.set(schema, parser);
  }
  return parser;
}

/** Parse Markdown into an editor document, or report why the rich editor can't hold it. */
export function parseMarkdown(markdown: string, schema: Schema): ParseResult {
  const env: ParseEnv = { unsupported: new Set() };
  try {
    const doc = parserFor(schema).parse(markdown, env);
    if (env.unsupported.size > 0) return { ok: false, reasons: [...env.unsupported] };
    return { ok: true, doc };
  } catch {
    return { ok: false, reasons: [...env.unsupported, 'Markdown the rich editor cannot represent'] };
  }
}

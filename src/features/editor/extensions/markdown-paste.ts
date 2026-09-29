import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import { parseMarkdown } from '../markdown/parse';

const MARKDOWN_HINTS =
  /^(#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>\s?|```|~~~|- \[[ xX]\])|(\*\*|__|~~)\S|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/m;

/** Whether plain text looks like Markdown worth converting on paste. */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_HINTS.test(text);
}

/**
 * Pasting plain text that contains Markdown (e.g. from a terminal or another
 * notes app) inserts formatted content. Ctrl+Shift+V still pastes plain text,
 * and pasting inside code blocks is never converted.
 */
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('linotesMarkdownPaste'),
        props: {
          clipboardTextParser(text, $context, plain) {
            if (plain || $context.parent.type.spec.code || !looksLikeMarkdown(text)) {
              return null as unknown as Slice;
            }
            const result = parseMarkdown(text, editor.schema);
            if (!result.ok) return null as unknown as Slice;
            return Slice.maxOpen(result.doc.content);
          },
        },
      }),
    ];
  },
});

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * A line break that came from a plain newline inside a Markdown paragraph
 * ("soft break"). Keeping it as its own node — instead of turning it into a
 * space — preserves hard-wrapped Markdown files exactly when they are edited
 * in rich mode. It is written back as a newline.
 */
export const SoftBreak = Node.create({
  name: 'softBreak',
  inline: true,
  group: 'inline',
  selectable: false,

  parseHTML() {
    return [{ tag: 'br[data-soft-break]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['br', mergeAttributes(HTMLAttributes, { 'data-soft-break': '', class: 'ln-soft-break' })];
  },

  renderText() {
    return '\n';
  },
});

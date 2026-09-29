import { mergeAttributes, type Attribute } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

/** Fenced code blocks with syntax highlighting for common languages (offline, via lowlight). */
export const LinotesCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, Attribute>;
    // `defaultLanguage` below only affects highlighting; new blocks stay unlabelled
    // so they are saved as a bare ``` fence.
    return { ...parent, language: { ...parent.language, default: null } };
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = (node.attrs.language as string | null) || null;
    return [
      'pre',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        language ? { 'data-language': language } : {},
      ),
      ['code', { class: language ? `${this.options.languageClassPrefix}${language}` : null }, 0],
    ];
  },
}).configure({
  lowlight,
  // Unlabelled blocks are shown as plain text rather than auto-detected.
  defaultLanguage: 'plaintext',
  enableTabIndentation: true,
});

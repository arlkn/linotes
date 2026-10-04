import type { AnyExtension } from '@tiptap/core';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { LinotesCodeBlock } from './code-block';
import { LinotesImage, type ImageOptions } from './image';
import { ImageInput, type ImageInputOptions } from './image-input';
import { LinotesBulletList, LinotesOrderedList, LinotesTaskItem, LinotesTaskList } from './lists';
import { MarkdownPaste } from './markdown-paste';
import { EditorShortcuts } from './shortcuts';
import { SoftBreak } from './soft-break';

export interface ExtensionOptions {
  placeholder?: string;
  onLink?: () => void;
  /** Showing and adding images (not needed for parsing and tests). */
  images?: Partial<ImageOptions & ImageInputOptions>;
}

/**
 * The editor schema. Every node and mark here has a Markdown representation
 * in `../markdown` — adding an extension requires adding its serializer and
 * parser rules too, or notes using it could not be saved faithfully.
 */
export function createExtensions(options: ExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // The trailing-node plugin edits the document on the first click, which
      // would mark untouched notes as changed and rewrite them on disk.
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['mailto'],
        HTMLAttributes: { target: null, rel: 'noopener noreferrer nofollow', class: null },
      },
    }),
    LinotesBulletList,
    LinotesOrderedList,
    LinotesTaskList,
    LinotesTaskItem,
    LinotesCodeBlock,
    LinotesImage.configure({
      resolveUrl: options.images?.resolveUrl ?? null,
      openExternal: options.images?.openExternal ?? null,
    }),
    ImageInput.configure({ upload: options.images?.upload ?? null }),
    SoftBreak,
    Placeholder.configure({ placeholder: options.placeholder ?? 'Start writing…' }),
    CharacterCount,
    MarkdownPaste,
    EditorShortcuts.configure({ onLink: options.onLink ?? (() => {}) }),
  ];
}

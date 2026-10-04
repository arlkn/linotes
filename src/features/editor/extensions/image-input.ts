import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { normalizeImageSrc } from '../markdown/tokenizer';

export interface ImageInputOptions {
  /** Store an image file for the note; the link to insert, or null. */
  upload: ((file: File) => Promise<string | null>) | null;
}

/** Files in a paste or drop (screenshots, images copied in a browser, files from Files). */
export function filesIn(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems.length > 0 ? fromItems : [...data.files];
}

async function insertImages(
  view: EditorView,
  files: File[],
  upload: (file: File) => Promise<string | null>,
  at: number | null,
): Promise<void> {
  const links: string[] = [];
  for (const file of files) {
    const link = await upload(file);
    if (link) links.push(link);
  }
  if (links.length === 0 || view.isDestroyed) return;
  const image = view.state.schema.nodes.image!;
  const { tr } = view.state;
  if (at !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size))));
  tr.replaceSelection(
    new Slice(Fragment.from(links.map((link) => image.create({ src: normalizeImageSrc(link) }))), 0, 0),
  );
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * Paste or drop image files into a note. Each image is stored by the backend
 * (in `attachments/`) and inserted as a Markdown image. Dragging an image that
 * is already in the note moves it, as ProseMirror does for any draggable node.
 */
export const ImageInput = Extension.create<ImageInputOptions>({
  name: 'imageInput',

  addOptions() {
    return { upload: null };
  },

  addProseMirrorPlugins() {
    const upload = this.options.upload;
    if (!upload) return [];
    return [
      new Plugin({
        key: new PluginKey('linotesImageInput'),
        props: {
          handlePaste(view, event) {
            const files = filesIn(event.clipboardData);
            if (files.length === 0) return false;
            void insertImages(view, files, upload, null);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;
            const files = filesIn(event.dataTransfer);
            if (files.length === 0) return false;
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
            void insertImages(view, files, upload, at);
            return true;
          },
        },
      }),
    ];
  },
});

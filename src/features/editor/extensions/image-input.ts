import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { AddedFile } from '@/types/domain';
import { normalizeImageSrc, tokenizer } from '../markdown/tokenizer';

export interface ImageInputOptions {
  /** Store an image file the page has; the added file, or null. */
  upload: ((file: File) => Promise<AddedFile | null>) | null;
  /** Files copied in the file manager, or a copied picture, from the system clipboard. */
  pasteFromSystem: (() => Promise<AddedFile[]>) | null;
}

type Upload = (file: File) => Promise<AddedFile | null>;

/** Images that exist only in the page: `blob:` and `data:` sources. */
const EMBEDDED = /^(blob:|data:image\/)/i;

/** Files in a paste or drop that the browser engine hands to the page. */
export function filesIn(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems.length > 0 ? fromItems : [...data.files];
}

/**
 * A paste the page gets nothing usable from: in WebKitGTK, a copied picture
 * (no types at all) or files copied in the file manager (a `text/uri-list`
 * type whose content is hidden from the page).
 */
export function isEmptyPaste(data: DataTransfer | null): boolean {
  return (
    data !== null && filesIn(data).length === 0 && !data.getData('text/plain') && !data.getData('text/html')
  );
}

/** The image behind a `blob:` or `data:` source, as a file to store. */
export async function embeddedImageFile(src: string): Promise<File | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png';
    return new File([blob], `image.${extension}`, { type: blob.type });
  } catch {
    return null;
  }
}

/** Editor content for added files: images, and links (named after the file) to other files. */
export function fileNodes(schema: Schema, files: AddedFile[]): PMNode[] {
  return files.flatMap((file, i) => {
    const node = file.image
      ? schema.nodes.image!.create({ src: normalizeImageSrc(file.link) })
      : schema.text(file.name || file.link, [
          schema.marks.link!.create({ href: tokenizer.normalizeLink(file.link) }),
        ]);
    return i === 0 ? [node] : [schema.text(' '), node];
  });
}

/** Insert added files at document position `at`, or at the cursor. */
export function insertAddedFiles(view: EditorView, files: AddedFile[], at: number | null): void {
  if (files.length === 0) return;
  insert(view, new Slice(Fragment.from(fileNodes(view.state.schema, files)), 0, 0), at);
}

function insert(view: EditorView, slice: Slice, at: number | null): void {
  if (view.isDestroyed || slice.content.size === 0) return;
  const { tr } = view.state;
  if (at !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size))));
  tr.replaceSelection(slice);
  // Typing after an inserted file link must not extend the link.
  tr.removeStoredMark(view.state.schema.marks.link!);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

async function insertFiles(
  view: EditorView,
  files: File[],
  upload: Upload,
  at: number | null,
): Promise<void> {
  const added: AddedFile[] = [];
  for (const file of files) {
    const result = await upload(file);
    if (result) added.push(result);
  }
  insertAddedFiles(view, added, at);
}

function embeddedSources(slice: Slice): string[] {
  const sources: string[] = [];
  slice.content.descendants((node) => {
    if (node.type.name === 'image' && EMBEDDED.test(String(node.attrs.src)))
      sources.push(String(node.attrs.src));
  });
  return sources;
}

/** `fragment` with embedded images pointing at their stored files (left out if they couldn't be stored). */
function withStoredImages(fragment: Fragment, links: Map<string, string | null>): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    const link = node.type.name === 'image' ? links.get(String(node.attrs.src)) : undefined;
    if (link === undefined) nodes.push(node.copy(withStoredImages(node.content, links)));
    else if (link !== null) nodes.push(node.type.create({ ...node.attrs, src: normalizeImageSrc(link) }));
  });
  return Fragment.fromArray(nodes);
}

/** Pasted or dropped content with `blob:`/`data:` images (e.g. from a document): store those, then insert it. */
async function insertWithImages(
  view: EditorView,
  slice: Slice,
  upload: Upload,
  at: number | null,
): Promise<void> {
  const links = new Map<string, string | null>();
  for (const src of embeddedSources(slice)) {
    if (links.has(src)) continue;
    const file = await embeddedImageFile(src);
    links.set(src, file ? ((await upload(file))?.link ?? null) : null);
  }
  insert(view, new Slice(withStoredImages(slice.content, links), slice.openStart, slice.openEnd), at);
}

/**
 * Paste or drop images and files into a note. Each is stored by the backend
 * in `attachments/` and inserted as a Markdown image or link. Dragging an
 * image that is already in the note moves it, as ProseMirror does for any
 * draggable node.
 */
export const ImageInput = Extension.create<ImageInputOptions>({
  name: 'imageInput',

  addOptions() {
    return { upload: null, pasteFromSystem: null };
  },

  addProseMirrorPlugins() {
    const { upload, pasteFromSystem } = this.options;
    if (!upload) return [];
    const handle = (view: EditorView, data: DataTransfer | null, slice: Slice, at: number | null) => {
      const files = filesIn(data);
      if (files.length > 0) {
        void insertFiles(view, files, upload, at);
        return true;
      }
      if (embeddedSources(slice).length > 0) {
        void insertWithImages(view, slice, upload, at);
        return true;
      }
      return false;
    };
    return [
      new Plugin({
        key: new PluginKey('linotesImageInput'),
        props: {
          handlePaste(view, event, slice) {
            if (pasteFromSystem && isEmptyPaste(event.clipboardData)) {
              void pasteFromSystem().then((files) => insertAddedFiles(view, files, null));
              return true;
            }
            return handle(view, event.clipboardData, slice, null);
          },
          handleDrop(view, event, slice, moved) {
            if (moved) return false;
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
            return handle(view, event.dataTransfer, slice, at);
          },
        },
      }),
    ];
  },
});

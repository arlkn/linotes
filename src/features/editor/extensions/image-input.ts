import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { normalizeImageSrc } from '../markdown/tokenizer';

export interface ImageInputOptions {
  /** Store an image file for the note; the link to insert, or null. */
  upload: ((file: File) => Promise<string | null>) | null;
}

type Upload = (file: File) => Promise<string | null>;

/** Images that exist only in the page: `blob:` and `data:` sources. */
const EMBEDDED = /^(blob:|data:image\/)/i;

/** Files in a paste or drop (screenshots, images copied in a browser, files from Files). */
export function filesIn(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems.length > 0 ? fromItems : [...data.files];
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

/**
 * WebKitGTK gives a pasted screenshot to the page only by pasting it itself,
 * as an `<img src="blob:…">`. During a paste event that isn't cancelled, let
 * it paste into a hidden element and read the images back from there.
 */
export function captureNativePaste(): Promise<File[]> {
  const target = document.createElement('div');
  target.contentEditable = 'true';
  target.style.cssText = 'position: fixed; left: -10000px; top: 0; width: 1px; height: 1px; overflow: hidden';
  document.body.append(target);
  target.focus();
  return new Promise((resolve) => {
    setTimeout(() => {
      const sources = [...target.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
      target.remove();
      void Promise.all(sources.filter((src) => EMBEDDED.test(src)).map(embeddedImageFile)).then((files) =>
        resolve(files.filter((file): file is File => file !== null)),
      );
    }, 50);
  });
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

function insert(view: EditorView, slice: Slice, at: number | null): void {
  if (view.isDestroyed || slice.content.size === 0) return;
  const { tr } = view.state;
  if (at !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size))));
  tr.replaceSelection(slice);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

async function insertFiles(
  view: EditorView,
  files: File[],
  upload: Upload,
  at: number | null,
): Promise<void> {
  const links: string[] = [];
  for (const file of files) {
    const link = await upload(file);
    if (link) links.push(link);
  }
  const image = view.state.schema.nodes.image!;
  const nodes = links.map((link) => image.create({ src: normalizeImageSrc(link) }));
  insert(view, new Slice(Fragment.from(nodes), 0, 0), at);
}

/** Pasted or dropped content with `blob:`/`data:` images: store those, then insert it. */
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
    links.set(src, file ? await upload(file) : null);
  }
  insert(view, new Slice(withStoredImages(slice.content, links), slice.openStart, slice.openEnd), at);
}

/**
 * Paste or drop images into a note: files (screenshots, files from Files) and
 * images embedded in pasted content (which is how WebKitGTK pastes a
 * screenshot). Each image is stored by the backend in `attachments/` and
 * inserted as a Markdown image. Dragging an image that is already in the note
 * moves it, as ProseMirror does for any draggable node.
 */
export const ImageInput = Extension.create<ImageInputOptions>({
  name: 'imageInput',

  addOptions() {
    return { upload: null };
  },

  addProseMirrorPlugins() {
    const upload = this.options.upload;
    if (!upload) return [];
    const handle = (view: EditorView, data: DataTransfer | null, slice: Slice, at: number | null) => {
      const files = filesIn(data);
      if (files.length > 0) {
        void insertFiles(view, files, upload, at);
        return true;
      }
      if (embeddedSources(slice).length === 0) return false;
      void insertWithImages(view, slice, upload, at);
      return true;
    };
    return [
      new Plugin({
        key: new PluginKey('linotesImageInput'),
        props: {
          handlePaste: (view, event, slice) => handle(view, event.clipboardData, slice, null),
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

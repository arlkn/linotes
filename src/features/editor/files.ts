import { errorMessage, getBackend } from '@/lib/backend';
import type { AddedFile, AddedFiles, FilesDropped } from '@/types/domain';
import { toast } from '@/features/ui/toasts';
import { resolveImagePath } from './image-paths';
import { escapeInline, imageDestination } from './markdown/serialize';
import { useEditorStore } from './store';

/**
 * Images and other files in notes. Notes link to them with relative Markdown
 * links (`![](../attachments/photo.png)`, `[Report.pdf](../attachments/Report.pdf)`);
 * the backend stores them in `attachments/`, serves images to the page and
 * opens the other files.
 *
 * WebKitGTK gives the page no data for files dropped from the file manager or
 * pasted after copying them there (nor for a copied picture), so those are
 * read by the backend: drops arrive as `files-dropped` events, and an empty
 * paste asks the backend to read the system clipboard.
 */

/** Largest image the page can add itself (the backend checks too). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** URL to show an image the open note links to, or null if it can't be shown. */
export function imageUrlFor(src: string): string | null {
  if (src.startsWith('data:image/')) return src;
  const folder = useEditorStore.getState().session?.folder ?? '';
  const path = resolveImagePath(folder, src);
  return path ? getBackend().imageUrl(path) || null : null;
}

/** Markdown for added files: images, and links to other files. */
export function markdownForFiles(files: AddedFile[]): string {
  return files
    .map((file) =>
      file.image
        ? `![](${imageDestination(file.link)})`
        : `[${escapeInline(file.name || file.link, true)}](${imageDestination(file.link)})`,
    )
    .join(' ');
}

/** Puts added files into the open editor, at window coordinates or at the cursor. */
type FileInserter = (files: AddedFile[], at: { x: number; y: number } | null) => void;
let inserter: FileInserter | null = null;

/** Called by the active editor; the returned function must be called on unmount. */
export function registerFileInserter(insert: FileInserter): () => void {
  inserter = insert;
  return () => {
    if (inserter === insert) inserter = null;
  };
}

/** The open note, if files can be added to it. */
function editableNoteId(): string | null {
  const session = useEditorStore.getState().session;
  return session && !session.trashed ? session.id : null;
}

function reportFailures(result: AddedFiles): AddedFile[] {
  for (const failure of result.failed) toast.error(`“${failure.name}” wasn’t added`, failure.reason);
  return result.added;
}

/** Store an image file the page has (pasted or dropped where the engine provides it). */
export async function addImageFile(file: File): Promise<AddedFile | null> {
  const noteId = editableNoteId();
  if (!noteId) return null;
  const name = file.name || 'image';
  if (file.type && !file.type.startsWith('image/')) {
    toast.error(`“${name}” wasn’t added`, 'Only images can be added this way.');
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(`“${name}” wasn’t added`, 'Images can be at most 25 MB.');
    return null;
  }
  try {
    return await getBackend().saveImage(noteId, name, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    toast.error(`“${name}” wasn’t added`, errorMessage(error));
    return null;
  }
}

/** Pick an image with the file chooser for the open note. */
export async function chooseImageFile(): Promise<AddedFile | null> {
  const noteId = editableNoteId();
  if (!noteId) return null;
  try {
    return await getBackend().chooseImage(noteId);
  } catch (error) {
    toast.error('Couldn’t add the image', errorMessage(error));
    return null;
  }
}

/** Files copied in the file manager, or a copied picture, from the system clipboard. */
export async function pasteSystemFiles(): Promise<AddedFile[]> {
  const noteId = editableNoteId();
  if (!noteId) return [];
  try {
    return reportFailures(await getBackend().pasteFiles(noteId));
  } catch (error) {
    toast.error('Couldn’t paste', errorMessage(error));
    return [];
  }
}

/** Files dropped from the file manager: add them to the open note where they landed. */
export async function addDroppedFiles(drop: FilesDropped): Promise<void> {
  const noteId = editableNoteId();
  const overEditor = document.elementFromPoint(drop.x, drop.y)?.closest('[data-region="editor"]');
  if (!noteId || !overEditor || !inserter) {
    toast.info('Drop files onto an open note', 'They’re added to the note where you drop them.');
    return;
  }
  try {
    const added = reportFailures(await getBackend().addDroppedFiles(noteId, drop.id));
    if (added.length > 0) inserter?.(added, { x: drop.x, y: drop.y });
  } catch (error) {
    toast.error('Couldn’t add the files', errorMessage(error));
  }
}

/** Open a file the open note links to (Ctrl+Click). */
export async function openLinkedFile(href: string): Promise<void> {
  const noteId = useEditorStore.getState().session?.id;
  if (!noteId) return;
  try {
    await getBackend().openLinkedFile(noteId, href);
  } catch (error) {
    toast.error('Couldn’t open the file', errorMessage(error));
  }
}

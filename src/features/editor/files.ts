import { errorMessage, getBackend } from '@/lib/backend';
import { toast } from '@/features/ui/toasts';
import { resolveImagePath } from './image-paths';
import { useEditorStore } from './store';

/**
 * Images in notes. Notes link to image files with relative Markdown links
 * (`![](../attachments/photo.png)`); new images are stored in `attachments/`
 * by the backend, which also serves them to the page.
 */

/** Largest image that can be added (the backend checks too). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** URL to show an image the open note links to, or null if it can't be shown. */
export function imageUrlFor(src: string): string | null {
  if (src.startsWith('data:image/')) return src;
  const folder = useEditorStore.getState().session?.folder ?? '';
  const path = resolveImagePath(folder, src);
  return path ? getBackend().imageUrl(path) || null : null;
}

/** Store an image file for the open note; the link to insert, or null after telling the user why not. */
export async function addImageFile(file: File): Promise<string | null> {
  const session = useEditorStore.getState().session;
  if (!session || session.trashed) return null;
  const name = file.name || 'image';
  if (file.type && !file.type.startsWith('image/')) {
    toast.error(`“${name}” wasn’t added`, 'Only images can be added to notes.');
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(`“${name}” wasn’t added`, 'Images can be at most 25 MB.');
    return null;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return (await getBackend().saveImage(session.id, name, bytes)).link;
  } catch (error) {
    toast.error(`“${name}” wasn’t added`, errorMessage(error));
    return null;
  }
}

/** Pick an image with the file chooser for the open note; the link to insert, or null. */
export async function chooseImageFile(): Promise<string | null> {
  const session = useEditorStore.getState().session;
  if (!session || session.trashed) return null;
  try {
    return (await getBackend().chooseImage(session.id))?.link ?? null;
  } catch (error) {
    toast.error('Couldn’t add the image', errorMessage(error));
    return null;
  }
}

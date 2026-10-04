/**
 * Notes link to images with relative Markdown links (`![](../attachments/photo.png)`),
 * resolved against the note's folder. Pure helpers, shared by the editor and its tests.
 */

/** A web address (`https://…`, `//…`). Such images are never loaded. */
export function isWebImage(src: string): boolean {
  return /^(https?:)?\/\//i.test(src);
}

/** Whether `src` is a relative file path: not a URL, absolute path, anchor or query. */
export function isRelativePath(src: string): boolean {
  if (!src || src.startsWith('/') || src.startsWith('#') || /[?#]/.test(src)) return false;
  return !/^[a-z][a-z\d+.-]*:/i.test(src);
}

/** The library-relative path of the image a note in `folder` links to, or null if it isn't one. */
export function resolveImagePath(folder: string, src: string): string | null {
  if (!isRelativePath(src)) return null;
  const parts = folder ? folder.split('/') : [];
  for (const part of src.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return null;
  }
  return parts.length > 0 ? parts.join('/') : null;
}

/** Link from a note in `folder` to the library-relative file `target`. */
export function relativeImagePath(folder: string, target: string): string {
  const from = folder ? folder.split('/') : [];
  const to = target.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...Array<string>(from.length - common).fill('..'), ...to.slice(common)].join('/');
}

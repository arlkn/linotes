import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import { isWebImage } from '../image-paths';
import { normalizeImageSrc } from '../markdown/tokenizer';

export interface ImageOptions {
  /** URL to show the image a note links to as `src`, or null if it can't be shown. */
  resolveUrl: ((src: string) => string | null) | null;
  /** Open a web image's address in the browser. */
  openExternal: ((url: string) => void) | null;
}

/**
 * Markdown images (`![alt](src "title")`). Inline, like in Markdown, and
 * draggable to move them within the note. Images on this computer are shown;
 * web images are never loaded and appear as a card with their address.
 */
export const LinotesImage = Node.create<ImageOptions>({
  name: 'image',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,

  addOptions() {
    return { resolveUrl: null, openExternal: null };
  },

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => {
          const src = element.getAttribute('src') ?? '';
          // Pasted pages can carry huge inline images; those don't belong in a Markdown file.
          if (/^(data|blob):/i.test(src)) return false;
          return {
            src: normalizeImageSrc(src),
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    const options = this.options;
    return ({ node }) => new ImageView(node, options);
  },
});

class ImageView implements NodeView {
  dom: HTMLElement;

  constructor(
    private node: PMNode,
    private options: ImageOptions,
  ) {
    this.dom = document.createElement('span');
    this.dom.className = 'ln-image';
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt;
    this.node = node;
    if (changed) this.render();
    return true;
  }

  /** Let the card's button work instead of selecting the image. */
  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLElement && event.target.closest('button') !== null;
  }

  ignoreMutation(): boolean {
    return true;
  }

  private render(): void {
    const src = String(this.node.attrs.src ?? '');
    const alt = String(this.node.attrs.alt ?? '');
    const title = this.node.attrs.title ? String(this.node.attrs.title) : '';
    if (isWebImage(src)) {
      this.dom.replaceChildren(this.webCard(src, alt));
      return;
    }
    const url = this.options.resolveUrl?.(src);
    if (!url) {
      this.dom.replaceChildren(card('Image not found', src));
      return;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt;
    if (title) img.title = title;
    img.draggable = false;
    img.addEventListener('error', () => img.replaceWith(card('Image not found', src)), { once: true });
    this.dom.replaceChildren(img);
  }

  private webCard(src: string, alt: string): HTMLElement {
    let host = src;
    try {
      host = new URL(src, 'https://invalid.invalid').host || src;
    } catch {
      // Show the address as written.
    }
    const element = card(alt ? `Web image: ${alt}` : 'Web image', `${host} · not loaded, for privacy`);
    const open = this.options.openExternal;
    if (open) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ln-image-card-button';
      button.textContent = 'Open in Browser';
      button.addEventListener('click', () => open(src));
      element.append(button);
    }
    return element;
  }
}

function card(label: string, detail: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'ln-image-card';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', `${label}: ${detail}`);
  const strong = document.createElement('strong');
  strong.textContent = label;
  const small = document.createElement('span');
  small.textContent = detail;
  element.append(strong, small);
  return element;
}

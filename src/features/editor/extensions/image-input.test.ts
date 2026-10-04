import { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeMarkdown } from '../markdown/serialize';
import { createExtensions } from '.';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function createEditor(upload: (file: File) => Promise<string | null>) {
  editor = new Editor({
    extensions: createExtensions({
      images: { upload, resolveUrl: (src) => `blob:shown/${src}`, openExternal: vi.fn() },
    }),
    content: '<p>Before after</p>',
  });
  return editor;
}

/** What a paste or drop of `files` looks like to ProseMirror. */
function transfer(files: File[]) {
  return { items: [], files, getData: () => '' } as unknown as DataTransfer;
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'Shot.png', { type: 'image/png' });

describe('adding images', () => {
  it('pastes image files as Markdown images at the cursor', async () => {
    const upload = vi.fn(async () => 'attachments/Shot.png');
    const view = createEditor(upload).view;
    editor!.commands.setTextSelection(8);
    const handled = view.someProp('handlePaste', (paste) =>
      paste(view, { clipboardData: transfer([png()]) } as unknown as ClipboardEvent, Slice.empty),
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(serializeMarkdown(view.state.doc)).toContain('!['));
    expect(upload).toHaveBeenCalledOnce();
    expect(serializeMarkdown(view.state.doc)).toBe('Before ![](attachments/Shot.png)after\n');
    expect(view.dom.querySelector('.ln-image img')?.getAttribute('src')).toBe(
      'blob:shown/attachments/Shot.png',
    );
  });

  it('leaves text pastes and moves of images inside the note to the editor', () => {
    const view = createEditor(vi.fn()).view;
    const paste = view.someProp('handlePaste', (handle) =>
      handle(view, { clipboardData: transfer([]) } as unknown as ClipboardEvent, Slice.empty),
    );
    const move = view.someProp('handleDrop', (handle) =>
      handle(view, { dataTransfer: transfer([png()]) } as unknown as DragEvent, Slice.empty, true),
    );
    expect(paste).toBeFalsy();
    expect(move).toBeFalsy();
  });

  it('inserts nothing when the image was refused', async () => {
    const upload = vi.fn(async () => null);
    const view = createEditor(upload).view;
    view.someProp('handlePaste', (paste) =>
      paste(view, { clipboardData: transfer([png()]) } as unknown as ClipboardEvent, Slice.empty),
    );
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    expect(serializeMarkdown(view.state.doc)).toBe('Before after\n');
  });

  it('stores images pasted as embedded pictures (how WebKitGTK pastes a screenshot)', async () => {
    const upload = vi.fn(async (file: File) =>
      file.type === 'image/png' ? 'attachments/image-1.png' : null,
    );
    const view = createEditor(upload).view;
    const { schema } = view.state;
    const pasted = (src: string) =>
      new Slice(
        Fragment.from(schema.nodes.paragraph!.create(null, schema.nodes.image!.create({ src }))),
        1,
        1,
      );
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    editor!.commands.setTextSelection(8);
    const handled = view.someProp('handlePaste', (paste) =>
      paste(view, { clipboardData: transfer([]) } as unknown as ClipboardEvent, pasted(png)),
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(serializeMarkdown(view.state.doc)).toContain('attachments/image-1.png'));
    expect(upload.mock.calls[0]![0].type).toBe('image/png');
    expect(serializeMarkdown(view.state.doc)).not.toContain('data:');

    // An embedded picture that can't be stored is left out, never saved as data.
    view.someProp('handlePaste', (paste) =>
      paste(
        view,
        { clipboardData: transfer([]) } as unknown as ClipboardEvent,
        pasted('data:image/gif;base64,R0lGOD'),
      ),
    );
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(serializeMarkdown(view.state.doc)).not.toContain('data:');
  });

  it('shows web images as a card instead of loading them', () => {
    const view = createEditor(vi.fn()).view;
    editor!.commands.setContent('<p><img src="https://example.com/cat.png" alt="Cat"></p>');
    expect(view.dom.querySelector('.ln-image img')).toBeNull();
    expect(view.dom.querySelector('.ln-image-card')?.textContent).toContain('example.com');
    expect(serializeMarkdown(view.state.doc)).toBe('![Cat](https://example.com/cat.png)\n');
  });
});

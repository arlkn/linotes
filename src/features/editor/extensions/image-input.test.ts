import { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddedFile } from '@/types/domain';
import { serializeMarkdown } from '../markdown/serialize';
import { createExtensions } from '.';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const added = (link: string, image = true, name = ''): AddedFile => ({ link, path: link, name, image });

function createEditor(
  upload: (file: File) => Promise<AddedFile | null>,
  pasteFromSystem: () => Promise<AddedFile[]> = async () => [],
) {
  editor = new Editor({
    extensions: createExtensions({
      images: { upload, pasteFromSystem, resolveUrl: (src) => `blob:shown/${src}`, openExternal: vi.fn() },
    }),
    content: '<p>Before after</p>',
  });
  return editor;
}

/** What a paste or drop of `files` looks like to ProseMirror. */
function transfer(files: File[]) {
  return {
    items: [],
    files,
    types: files.length > 0 ? ['Files'] : [],
    getData: () => '',
  } as unknown as DataTransfer;
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'Shot.png', { type: 'image/png' });

describe('adding images', () => {
  it('pastes image files as Markdown images at the cursor', async () => {
    const upload = vi.fn(async () => added('attachments/Shot.png'));
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
    const text = {
      items: [],
      files: [],
      types: ['text/plain'],
      getData: (type: string) => (type === 'text/plain' ? 'hi' : ''),
    } as unknown as DataTransfer;
    const paste = view.someProp('handlePaste', (handle) =>
      handle(view, { clipboardData: text } as unknown as ClipboardEvent, Slice.empty),
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

  it('stores pictures embedded in pasted HTML as files', async () => {
    const upload = vi.fn(async (file: File) =>
      file.type === 'image/png' ? added('attachments/image-1.png') : null,
    );
    const view = createEditor(upload).view;
    const { schema } = view.state;
    const html = {
      items: [],
      files: [],
      types: ['text/html'],
      getData: (type: string) => (type === 'text/html' ? '<img src="data:image/png;base64,…">' : ''),
    } as unknown as DataTransfer;
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
      paste(view, { clipboardData: html } as unknown as ClipboardEvent, pasted(png)),
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(serializeMarkdown(view.state.doc)).toContain('attachments/image-1.png'));
    expect(upload.mock.calls[0]![0].type).toBe('image/png');
    expect(serializeMarkdown(view.state.doc)).not.toContain('data:');

    // An embedded picture that can't be stored is left out, never saved as data.
    view.someProp('handlePaste', (paste) =>
      paste(
        view,
        { clipboardData: html } as unknown as ClipboardEvent,
        pasted('data:image/gif;base64,R0lGOD'),
      ),
    );
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(serializeMarkdown(view.state.doc)).not.toContain('data:');
  });

  it('pastes files copied in the file manager, read from the system clipboard', async () => {
    const pasteFromSystem = vi.fn(async () => [
      added('attachments/Report.pdf', false, 'Q3 [final].pdf'),
      added('attachments/photo.jpg'),
    ]);
    const view = createEditor(vi.fn(), pasteFromSystem).view;
    editor!.commands.setTextSelection(8);
    // What WebKitGTK hands the page for copied files: a type, but no content.
    const copied = {
      items: [],
      files: [],
      types: ['text/uri-list'],
      getData: () => '',
    } as unknown as DataTransfer;
    const handled = view.someProp('handlePaste', (paste) =>
      paste(view, { clipboardData: copied } as unknown as ClipboardEvent, Slice.empty),
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(serializeMarkdown(view.state.doc)).toContain('photo.jpg'));
    expect(serializeMarkdown(view.state.doc)).toBe(
      'Before [Q3 \\[final\\].pdf](attachments/Report.pdf) ![](attachments/photo.jpg)after\n',
    );
  });

  it('keeps text typed after an inserted file link out of the link', async () => {
    const pasteFromSystem = vi.fn(async () => [added('attachments/Report.pdf', false, 'Report.pdf')]);
    const view = createEditor(vi.fn(), pasteFromSystem).view;
    editor!.commands.setTextSelection(8);
    const copied = {
      items: [],
      files: [],
      types: ['text/uri-list'],
      getData: () => '',
    } as unknown as DataTransfer;
    view.someProp('handlePaste', (paste) =>
      paste(view, { clipboardData: copied } as unknown as ClipboardEvent, Slice.empty),
    );
    await vi.waitFor(() => expect(serializeMarkdown(view.state.doc)).toContain('Report.pdf'));
    view.dispatch(view.state.tr.insertText(' notes'));
    expect(serializeMarkdown(view.state.doc)).toBe(
      'Before [Report.pdf](attachments/Report.pdf) notesafter\n',
    );
  });

  it('shows web images as a card instead of loading them', () => {
    const view = createEditor(vi.fn()).view;
    editor!.commands.setContent('<p><img src="https://example.com/cat.png" alt="Cat"></p>');
    expect(view.dom.querySelector('.ln-image img')).toBeNull();
    expect(view.dom.querySelector('.ln-image-card')?.textContent).toContain('example.com');
    expect(serializeMarkdown(view.state.doc)).toBe('![Cat](https://example.com/cat.png)\n');
  });
});

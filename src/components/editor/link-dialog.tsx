import type { Editor } from '@tiptap/core';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/controls';
import { Modal, ModalFooter } from '@/components/ui/modal';

function normalizeUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) return `mailto:${url}`;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(url)) return `https://${url}`;
  // Relative links (e.g. to another Markdown file) are stored as written.
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return null;
}

export function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => {
    onOpenChange(false);
    editor.commands.focus();
  };
  const existing = open ? ((editor.getAttributes('link').href as string | undefined) ?? '') : '';
  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={existing ? 'Edit Link' : 'Insert Link'}
    >
      {/* Mounted fresh on every open, so it starts from the current link. */}
      <LinkForm editor={editor} existing={existing} onDone={() => onOpenChange(false)} onCancel={close} />
    </Modal>
  );
}

function LinkForm({
  editor,
  existing,
  onDone,
  onCancel,
}: {
  editor: Editor;
  existing: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(existing);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const href = normalizeUrl(value);
    if (!href) {
      setError('Enter a web address (https://…), an email address, or a relative link.');
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain
        .insertContent({ type: 'text', text: value.trim(), marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="px-5 pt-4">
        <label className="mb-1.5 block text-sm font-medium" htmlFor="ln-link-url">
          Address
        </label>
        <TextInput
          id="ln-link-url"
          autoFocus
          value={value}
          placeholder="https://example.com"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        <p className="mt-2 text-xs text-muted">Ctrl+Click a link in a note to open it in your browser.</p>
      </div>
      <ModalFooter>
        {existing && (
          <Button
            variant="danger-ghost"
            className="mr-auto"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onDone();
            }}
          >
            Remove Link
          </Button>
        )}
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary">
          {existing ? 'Save' : 'Insert'}
        </Button>
      </ModalFooter>
    </form>
  );
}

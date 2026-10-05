import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { openExternalLink } from '@/features/app/lifecycle';
import { createExtensions } from '@/features/editor/extensions';
import { insertAddedFiles } from '@/features/editor/extensions/image-input';
import {
  addImageFile,
  imageUrlFor,
  openLinkedFile,
  pasteSystemFiles,
  registerFileInserter,
} from '@/features/editor/files';
import { isRelativePath } from '@/features/editor/image-paths';
import { serializeMarkdown } from '@/features/editor/markdown/serialize';
import { countText } from '@/features/editor/stats';
import { registerContentProvider, useEditorStore, type EditorSession } from '@/features/editor/store';
import { useSettings } from '@/features/settings/store';
import { toast } from '@/features/ui/toasts';
import { useUi } from '@/features/ui/ui-store';
import { LinkDialog } from './link-dialog';
import { TitleField } from './title-field';
import { FormattingToolbar } from './toolbar';

const STATS_DELAY_MS = 150;

function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href);
}

export function RichEditor({ session }: { session: EditorSession }) {
  const spellcheck = useSettings((s) => s.settings.spellcheck);
  const markDirty = useEditorStore((s) => s.markDirty);
  const setStats = useEditorStore((s) => s.setStats);
  const focusRequest = useEditorStore((s) => s.focusRequest);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linksActive, setLinksActive] = useState(false);
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extensions = useMemo(
    () =>
      createExtensions({
        placeholder: 'Start writing…',
        onLink: () => setLinkOpen(true),
        onEscape: () => useUi.getState().focusList(),
        images: {
          resolveUrl: imageUrlFor,
          upload: addImageFile,
          pasteFromSystem: pasteSystemFiles,
          openExternal: (url) => void openExternalLink(url),
        },
      }),
    [],
  );

  const updateStats = (editor: Editor) => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      if (!editor.isDestroyed) setStats(countText(editor.getText({ blockSeparator: '\n' })));
    }, STATS_DELAY_MS);
  };

  const editor = useEditor(
    {
      extensions,
      content: session.richDoc ?? '',
      editable: !session.trashed,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'ln-prose min-h-[40vh] pb-[30vh]',
          spellcheck: String(spellcheck),
          'aria-label': 'Note content',
          'aria-multiline': 'true',
          role: 'textbox',
        },
        handleClick(view, pos, event) {
          if (!(event.ctrlKey || event.metaKey)) return false;
          const link = view.state.doc
            .resolve(pos)
            .marks()
            .find((mark) => mark.type.name === 'link');
          const href = link?.attrs.href as string | undefined;
          if (!href) return false;
          if (isExternalHref(href)) void openExternalLink(href);
          else if (isRelativePath(href)) void openLinkedFile(href);
          else toast.info('This link can’t be opened', href);
          return true;
        },
        handleDOMEvents: {
          // Never let the webview follow a link (middle-click, drag…).
          auxclick: (_view, event) => {
            if ((event.target as HTMLElement).closest('a')) event.preventDefault();
            return false;
          },
        },
      },
      onUpdate: ({ editor: updated }) => {
        markDirty();
        updateStats(updated);
      },
    },
    [session.id, session.generation],
  );

  // Initial counts (also after the editor is re-created).
  useEffect(() => {
    setStats(countText(editor.getText({ blockSeparator: '\n' })));
  }, [editor, setStats]);

  const { id, generation } = session;
  useEffect(
    () => registerContentProvider({ id, generation }, () => serializeMarkdown(editor.state.doc)),
    [editor, id, generation],
  );

  // Files dropped from the file manager arrive outside the page (see features/editor/files.ts).
  useEffect(
    () =>
      registerFileInserter((files, at) => {
        if (editor.isDestroyed) return;
        const pos = at ? (editor.view.posAtCoords({ left: at.x, top: at.y })?.pos ?? null) : null;
        insertAddedFiles(editor.view, files, pos);
      }),
    [editor],
  );

  useEffect(() => {
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps.attributes as Record<string, string>),
          spellcheck: String(spellcheck),
        },
      },
    });
  }, [editor, spellcheck]);

  useEffect(() => {
    if (focusRequest?.target === 'body') editor.commands.focus('start');
  }, [editor, focusRequest]);

  // Holding Ctrl shows links as clickable.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => setLinksActive(event.ctrlKey || event.metaKey);
    const reset = () => setLinksActive(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', reset);
    };
  }, []);

  useEffect(() => {
    editor.view.dom.classList.toggle('ln-links-active', linksActive);
  }, [editor, linksActive]);

  useEffect(
    () => () => {
      if (statsTimer.current) clearTimeout(statsTimer.current);
    },
    [],
  );

  return (
    <>
      {!session.trashed && <FormattingToolbar editor={editor} onLink={() => setLinkOpen(true)} />}
      <div className="min-h-0 flex-1 overflow-y-auto" data-editor-scroll>
        <div className="mx-auto w-full max-w-[48rem] px-8 pt-8 lg:px-12">
          <TitleField
            session={session}
            onEnter={() => {
              // TipTap defers DOM focus to the next frame; focus now so fast typing isn't lost.
              editor.commands.focus('start');
              editor.view.focus();
            }}
          />
          <EditorContent editor={editor} className="mt-4" />
        </div>
      </div>
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
    </>
  );
}

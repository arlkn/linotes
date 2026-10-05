import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { filesIn, isEmptyPaste } from '@/features/editor/extensions/image-input';
import {
  addImageFile,
  markdownForFiles,
  pasteSystemFiles,
  registerFileInserter,
} from '@/features/editor/files';
import { countText, markdownToPlainText } from '@/features/editor/stats';
import { registerContentProvider, useEditorStore, type EditorSession } from '@/features/editor/store';
import { useSettings } from '@/features/settings/store';
import type { AddedFile } from '@/types/domain';
import { TitleField } from './title-field';

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.3em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.15em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--ln-accent-text)' },
  { tag: tags.monospace, color: 'var(--ln-fg)', backgroundColor: 'var(--ln-code-bg)' },
  { tag: tags.quote, color: 'var(--ln-fg-muted)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--ln-fg-subtle)' },
  { tag: tags.comment, color: 'var(--ln-fg-subtle)', fontStyle: 'italic' },
]);

const STATS_DELAY_MS = 200;

/**
 * Paste or drop images and files: each is stored and Markdown for it inserted
 * where it landed. In WebKitGTK a paste of copied files or a copied picture
 * reaches the page empty; the backend reads the clipboard instead.
 */
const fileInput = EditorView.domEventHandlers({
  paste(event, view) {
    const at = view.state.selection.main.head;
    const files = filesIn(event.clipboardData);
    if (files.length > 0) void uploadAndInsert(view, files, at);
    else if (isEmptyPaste(event.clipboardData))
      void pasteSystemFiles().then((added) => insertFiles(view, added, at));
    else return false;
    return true;
  },
  drop(event, view) {
    const files = filesIn(event.dataTransfer);
    if (files.length === 0) return false;
    const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
    void uploadAndInsert(view, files, at);
    return true;
  },
});

async function uploadAndInsert(view: EditorView, files: File[], at: number): Promise<void> {
  const added: AddedFile[] = [];
  for (const file of files) {
    const result = await addImageFile(file);
    if (result) added.push(result);
  }
  insertFiles(view, added, at);
}

function insertFiles(view: EditorView, files: AddedFile[], at: number): void {
  if (files.length === 0 || !view.dom.isConnected) return;
  const text = markdownForFiles(files);
  const from = Math.min(at, view.state.doc.length);
  view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

/** Plain Markdown editing with syntax highlighting. */
export function SourceEditor({ session }: { session: EditorSession }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const spellcheck = useSettings((s) => s.settings.spellcheck);
  const spellcheckCompartment = useRef(new Compartment());
  const markDirty = useEditorStore((s) => s.markDirty);
  const setStats = useEditorStore((s) => s.setStats);
  const focusRequest = useEditorStore((s) => s.focusRequest);

  useEffect(() => {
    if (!host.current) return;
    let statsTimer: ReturnType<typeof setTimeout> | null = null;
    const updateStats = (text: string) => {
      if (statsTimer) clearTimeout(statsTimer);
      statsTimer = setTimeout(() => setStats(countText(markdownToPlainText(text))), STATS_DELAY_MS);
    };
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: session.content,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownHighlight),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          placeholder('Start writing Markdown…'),
          EditorState.readOnly.of(session.trashed),
          EditorView.editable.of(!session.trashed),
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', 'aria-multiline': 'true' }),
          spellcheckCompartment.current.of(
            EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
          ),
          fileInput,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              markDirty();
              updateStats(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    updateStats(session.content);
    const unregister = registerContentProvider(session, () => view.state.doc.toString());
    // Files dropped from the file manager arrive outside the page (see features/editor/files.ts).
    const unregisterInserter = registerFileInserter((files, at) =>
      insertFiles(view, files, (at && view.posAtCoords(at)) ?? view.state.selection.main.head),
    );
    return () => {
      unregisterInserter();
      if (statsTimer) clearTimeout(statsTimer);
      unregister();
      view.destroy();
      viewRef.current = null;
    };
    // The editor is rebuilt only for a new note or new content (generation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.generation]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: spellcheckCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
      ),
    });
  }, [spellcheck]);

  useEffect(() => {
    if (focusRequest?.target === 'body' && viewRef.current) {
      viewRef.current.focus();
      viewRef.current.dispatch({ selection: { anchor: 0 } });
    }
  }, [focusRequest]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-editor-scroll>
      <div className="mx-auto w-full max-w-[48rem] px-8 pt-8 lg:px-12">
        <TitleField session={session} onEnter={() => viewRef.current?.focus()} />
        <div ref={host} className="ln-source mt-4 [&_.cm-scroller]:overflow-visible" />
      </div>
    </div>
  );
}

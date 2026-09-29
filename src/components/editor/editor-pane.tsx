import { NotebookPen, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Kbd, Spinner } from '@/components/ui/controls';
import { EmptyState } from '@/components/notes/empty-state';
import { useEditorStore } from '@/features/editor/store';
import { createNote } from '@/features/notes/actions';
import { EditorBanners } from './editor-banners';
import { EditorHeader } from './editor-header';
import { RichEditor } from './rich-editor';
import { SourceEditor } from './source-editor';
import { StatusBar } from './status-bar';

export function EditorPane() {
  const { session, loadingId } = useEditorStore(
    useShallow((s) => ({ session: s.session, loadingId: s.loadingId })),
  );

  if (!session) {
    return (
      <div className="flex h-full flex-col bg-editor">
        {loadingId ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No note selected"
            description={
              <>
                Pick a note from the list, or press <Kbd>Ctrl</Kbd> <Kbd>N</Kbd> to start a new one.
              </>
            }
            action={
              <Button variant="primary" onClick={() => void createNote()}>
                <Plus className="size-4" strokeWidth={2.2} /> New Note
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor" aria-busy={loadingId !== null}>
      <EditorHeader session={session} />
      <EditorBanners session={session} />
      {session.mode === 'rich' ? (
        <RichEditor key={`${session.id}:${session.generation}`} session={session} />
      ) : (
        <SourceEditor key={`${session.id}:${session.generation}`} session={session} />
      )}
      <StatusBar />
    </div>
  );
}

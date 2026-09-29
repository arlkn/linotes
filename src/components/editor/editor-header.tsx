import { Ellipsis, FileCode, Folder, RotateCcw, Star, Type } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button, IconButton } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';
import { NoteActions } from '@/components/notes/note-actions';
import { useEditorStore, type EditorSession } from '@/features/editor/store';
import { folderLabel } from '@/features/notes/folder-tree';
import { moveNote, restoreNote, toggleFavorite } from '@/features/notes/actions';
import { useLibrary } from '@/features/notes/store';
import type { EditorMode } from '@/types/domain';

export function EditorHeader({ session }: { session: EditorSession }) {
  const summary = useLibrary(useShallow((s) => s.notes.find((n) => n.id === session.id)));
  const setMode = useEditorStore((s) => s.setMode);
  const richUnavailable = session.richBlocked !== null;

  return (
    <header className="flex h-[3.25rem] shrink-0 items-center gap-2 border-b border-line px-3">
      <button
        type="button"
        disabled={session.trashed}
        onClick={() => void moveNote(session.id)}
        title={session.trashed ? undefined : 'Move to another folder'}
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-hover hover:text-fg disabled:hover:bg-transparent"
      >
        <Folder className="size-4 shrink-0" strokeWidth={1.8} />
        <span className="truncate">{session.trashed ? 'Trash' : folderLabel(session.folder)}</span>
      </button>
      <span className="flex-1" />
      {session.trashed ? (
        <Button size="sm" onClick={() => void restoreNote(session.id)}>
          <RotateCcw className="size-3.5" strokeWidth={2} /> Restore
        </Button>
      ) : (
        <>
          <div
            className={richUnavailable ? 'opacity-60' : undefined}
            title={richUnavailable ? 'This note can only be edited as Markdown' : undefined}
          >
            <Segmented<EditorMode>
              label="Editing mode"
              size="sm"
              value={session.mode}
              onChange={(mode) => setMode(mode)}
              options={[
                { value: 'rich', label: 'Rich text', icon: Type },
                { value: 'markdown', label: 'Markdown', icon: FileCode },
              ]}
            />
          </div>
          <IconButton
            label={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
            shortcut="Ctrl+D"
            icon={Star}
            active={session.favorite}
            iconClassName={session.favorite ? 'fill-accent text-accent' : undefined}
            onClick={() => void toggleFavorite(session.id)}
          />
        </>
      )}
      {summary && (
        <Menu>
          <MenuTrigger asChild>
            <IconButton label="More actions" icon={Ellipsis} />
          </MenuTrigger>
          <MenuContent>
            <NoteActions note={summary} variant="menu" />
          </MenuContent>
        </Menu>
      )}
    </header>
  );
}

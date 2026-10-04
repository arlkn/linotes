import { useState, type ReactElement } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/menu';
import type { NoteSummary } from '@/types/domain';
import { NoteActions } from './note-actions';

/**
 * One right-click menu for the whole notes list; rows mark themselves with
 * `data-note-id`. Every Radix menu adds document-wide key listeners, so a menu
 * per row made each key press (even typing in a note) slower with every note.
 */
export function NoteListMenu({ notes, children }: { notes: NoteSummary[]; children: ReactElement }) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const note = noteId === null ? undefined : notes.find((n) => n.id === noteId);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>('[data-note-id]');
          // No menu for the empty space below the notes.
          if (row?.dataset.noteId) setNoteId(row.dataset.noteId);
          else event.preventDefault();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>{note && <NoteActions note={note} variant="context" />}</ContextMenuContent>
    </ContextMenu>
  );
}

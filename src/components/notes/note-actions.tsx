import { Download, ExternalLink, FolderInput, RotateCcw, Star, StarOff, Trash, X } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { getBackend, errorMessage } from '@/lib/backend';
import { exportNote } from '@/features/import-export/actions';
import {
  deleteNotePermanently,
  moveNote,
  restoreNote,
  toggleFavorite,
  trashNote,
} from '@/features/notes/actions';
import { toast } from '@/features/ui/toasts';
import type { NoteSummary } from '@/types/domain';

async function revealInFiles(id: string) {
  try {
    await getBackend().revealNoteFile(id);
  } catch (error) {
    toast.error('Couldn’t show the file', errorMessage(error));
  }
}

/** The actions available for a note, used by context menus and the editor's menu. */
export function NoteActions({ note, variant }: { note: NoteSummary; variant: 'context' | 'menu' }) {
  const Item = variant === 'context' ? ContextMenuItem : MenuItem;
  const Separator = variant === 'context' ? ContextMenuSeparator : MenuSeparator;

  if (note.trashed) {
    return (
      <>
        <Item icon={RotateCcw} onSelect={() => void restoreNote(note.id)}>
          Restore
        </Item>
        <Separator />
        <Item icon={X} danger onSelect={() => void deleteNotePermanently(note.id)}>
          Delete Permanently…
        </Item>
      </>
    );
  }

  return (
    <>
      <Item
        icon={note.favorite ? StarOff : Star}
        shortcut="Ctrl+D"
        onSelect={() => void toggleFavorite(note.id)}
      >
        {note.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
      </Item>
      <Item icon={FolderInput} onSelect={() => void moveNote(note.id)}>
        Move to…
      </Item>
      <Item icon={Download} onSelect={() => void exportNote(note.id)}>
        Export as Markdown…
      </Item>
      <Item icon={ExternalLink} onSelect={() => void revealInFiles(note.id)}>
        Show in Files
      </Item>
      <Separator />
      <Item icon={Trash} danger onSelect={() => void trashNote(note.id)}>
        Move to Trash
      </Item>
    </>
  );
}

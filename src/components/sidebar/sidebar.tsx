import { Clock, FileText, FolderPlus, Settings, Star, Trash } from 'lucide-react';
import { useMemo, type KeyboardEvent } from 'react';
import { Logo } from '@/components/brand/logo';
import { IconButton } from '@/components/ui/button';
import { createFolder, moveNote, setView, toggleFavorite, trashNote } from '@/features/notes/actions';
import { useLibrary } from '@/features/notes/store';
import { countViews, type View } from '@/features/notes/views';
import { useUi } from '@/features/ui/ui-store';
import { FolderTree } from './folder-tree';
import { SidebarItem } from './sidebar-item';

/** Arrow keys move between sidebar entries. */
function onNavKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-nav-item]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const view = useLibrary((s) => s.view);
  const notes = useLibrary((s) => s.notes);
  const counts = useMemo(() => countViews(notes), [notes]);
  const openSettings = useUi((s) => s.openSettings);

  const go = (next: View) => {
    setView(next);
    onNavigate?.();
  };

  return (
    <nav aria-label="Library" className="flex h-full flex-col bg-sidebar" onKeyDown={onNavKeyDown}>
      <header className="flex h-[3.25rem] shrink-0 items-center gap-2.5 px-4">
        <Logo size={1.75} />
        <span className="text-[0.95rem] font-semibold tracking-tight">Linotes</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-px">
          <li>
            <SidebarItem
              icon={FileText}
              label="All Notes"
              count={counts.all}
              active={view.kind === 'all'}
              onSelect={() => go({ kind: 'all' })}
              onDropNote={(id) => void moveNote(id, '')}
            />
          </li>
          <li>
            <SidebarItem
              icon={Star}
              label="Favorites"
              count={counts.favorites}
              active={view.kind === 'favorites'}
              onSelect={() => go({ kind: 'favorites' })}
              onDropNote={(id) => {
                const note = useLibrary.getState().notes.find((n) => n.id === id);
                if (note && !note.favorite) void toggleFavorite(id);
              }}
            />
          </li>
          <li>
            <SidebarItem
              icon={Clock}
              label="Recently Edited"
              count={counts.recent}
              active={view.kind === 'recent'}
              onSelect={() => go({ kind: 'recent' })}
            />
          </li>
          <li>
            <SidebarItem
              icon={Trash}
              label="Trash"
              count={counts.trash}
              active={view.kind === 'trash'}
              onSelect={() => go({ kind: 'trash' })}
              onDropNote={(id) => void trashNote(id)}
            />
          </li>
        </ul>

        <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-2.5">
          <h2 className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">Folders</h2>
          <IconButton
            label="New folder"
            shortcut="Ctrl+Shift+N"
            icon={FolderPlus}
            size="sm"
            onClick={() => void createFolder('')}
          />
        </div>
        <FolderTree onNavigate={onNavigate} />
      </div>

      <footer className="shrink-0 border-t border-line p-2">
        <SidebarItem icon={Settings} label="Settings" onSelect={() => openSettings()} />
      </footer>
    </nav>
  );
}

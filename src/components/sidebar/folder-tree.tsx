import {
  ChevronRight,
  Ellipsis,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Download,
  PencilLine,
  Trash,
} from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import {
  createFolder,
  createNote,
  deleteFolder,
  moveNote,
  renameFolder,
  setView,
} from '@/features/notes/actions';
import { buildFolderTree, flattenTree, type FolderNode } from '@/features/notes/folder-tree';
import { useLibrary } from '@/features/notes/store';
import { exportZip } from '@/features/import-export/actions';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { SidebarItem } from './sidebar-item';

function FolderActions({ path, variant }: { path: string; variant: 'context' | 'menu' }) {
  const Item = variant === 'context' ? ContextMenuItem : MenuItem;
  const Separator = variant === 'context' ? ContextMenuSeparator : MenuSeparator;
  return (
    <>
      <Item icon={FilePlus} onSelect={() => void createNote({ folder: path })}>
        New Note Here
      </Item>
      <Item icon={FolderPlus} onSelect={() => void createFolder(path)}>
        New Subfolder…
      </Item>
      <Item icon={PencilLine} onSelect={() => void renameFolder(path)}>
        Rename…
      </Item>
      <Item icon={Download} onSelect={() => void exportZip(path)}>
        Export as ZIP…
      </Item>
      <Separator />
      <Item icon={Trash} danger onSelect={() => void deleteFolder(path)}>
        Delete Folder…
      </Item>
    </>
  );
}

function FolderRow({ node, onNavigate }: { node: FolderNode; onNavigate?: () => void }) {
  const { folder, children, depth } = node;
  const active = useLibrary((s) => s.view.kind === 'folder' && s.view.path === folder.path);
  const collapsed = useLibrary((s) => s.collapsedFolders.has(folder.path));
  const toggle = useLibrary((s) => s.toggleFolderCollapsed);
  const hasChildren = children.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li>
          <SidebarItem
            icon={active ? FolderOpen : Folder}
            label={folder.name}
            count={folder.noteCount}
            active={active}
            indent={depth}
            onSelect={() => {
              setView({ kind: 'folder', path: folder.path });
              onNavigate?.();
            }}
            onDropNote={(id) => void moveNote(id, folder.path)}
            leading={
              <button
                type="button"
                tabIndex={-1}
                aria-label={collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                onClick={() => toggle(folder.path)}
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg',
                  !hasChildren && 'invisible',
                )}
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
                  strokeWidth={2}
                />
              </button>
            }
            trailing={
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions for ${folder.name}`}
                    className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
                  >
                    <Ellipsis className="size-4" strokeWidth={2} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start">
                  <FolderActions path={folder.path} variant="menu" />
                </MenuContent>
              </Menu>
            }
          />
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <FolderActions path={folder.path} variant="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FolderTree({ onNavigate }: { onNavigate?: () => void }) {
  const folders = useLibrary((s) => s.folders);
  const collapsed = useLibrary((s) => s.collapsedFolders);
  const rows = useMemo(() => flattenTree(buildFolderTree(folders), collapsed), [folders, collapsed]);

  if (rows.length === 0) {
    return (
      <button
        type="button"
        onClick={() => void createFolder('')}
        className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-left text-xs text-muted hover:bg-hover hover:text-fg"
      >
        <FolderPlus className="size-4" strokeWidth={1.8} />
        Create a folder to organise notes
      </button>
    );
  }

  return (
    <ul className="flex flex-col gap-px" aria-label="Folders">
      {rows.map((node) => (
        <FolderRow key={node.folder.path} node={node} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

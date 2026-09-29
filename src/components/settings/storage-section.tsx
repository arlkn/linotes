import { Download, FolderInput, FolderOpen, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getBackend } from '@/lib/backend';
import {
  chooseNotesFolder,
  openNotesFolderInFiles,
  rebuildSearchIndex,
  switchToDefaultNotesFolder,
} from '@/features/app/lifecycle';
import { exportZip, importFiles, importFolder } from '@/features/import-export/actions';
import { useLibrary } from '@/features/notes/store';
import type { AppInfo } from '@/types/domain';
import { PreferenceGroup, PreferenceRow } from './preference-row';

export function StorageSection() {
  const status = useLibrary((s) => s.status);
  const view = useLibrary((s) => s.view);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const importTarget = view.kind === 'folder' ? view.path : '';

  useEffect(() => {
    void getBackend()
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PreferenceGroup
        title="Notes Folder"
        description="Every note is a Markdown file in this folder. Folders in Linotes are ordinary directories."
      >
        <div className="px-4 py-3">
          <code className="ln-selectable block rounded-lg bg-surface px-3 py-2 font-mono text-xs break-all text-fg">
            {status?.root ?? '—'}
          </code>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void run(chooseNotesFolder)}>
              <FolderInput className="size-3.5" strokeWidth={2} /> Change…
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void openNotesFolderInFiles()}>
              <FolderOpen className="size-3.5" strokeWidth={2} /> Open in Files
            </Button>
            {status && !status.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(switchToDefaultNotesFolder)}
              >
                Use Default Folder
              </Button>
            )}
          </div>
        </div>
      </PreferenceGroup>

      <PreferenceGroup
        title="Import"
        description={
          <>
            Markdown and text files are copied into {importTarget ? `“${importTarget}”` : 'your notes folder'}
            ; the originals are not changed. Problems are listed file by file.
          </>
        }
      >
        <PreferenceRow
          title="Import files"
          description=".md, .markdown and .txt files"
          control={
            <Button size="sm" disabled={busy} onClick={() => void run(() => importFiles(importTarget))}>
              <Upload className="size-3.5" strokeWidth={2} /> Import Files…
            </Button>
          }
        />
        <PreferenceRow
          title="Import a folder"
          description="Keeps its subfolders. Hidden files are skipped."
          control={
            <Button size="sm" disabled={busy} onClick={() => void run(() => importFolder(importTarget))}>
              <Upload className="size-3.5" strokeWidth={2} /> Import Folder…
            </Button>
          }
        />
      </PreferenceGroup>

      <PreferenceGroup title="Export and Backup">
        <PreferenceRow
          title="Export all notes"
          description="A ZIP archive of your notes and folders (the Trash is not included)."
          control={
            <Button size="sm" disabled={busy} onClick={() => void run(() => exportZip(null))}>
              <Download className="size-3.5" strokeWidth={2} /> Export as ZIP…
            </Button>
          }
        />
        <div className="px-4 py-3 text-xs leading-relaxed text-muted">
          <p className="font-medium text-fg">Backing up without Linotes</p>
          <p className="mt-1">
            Your notes are plain files, so any backup tool works: copy the notes folder, sync it with
            Syncthing or Nextcloud, or keep it in a Git repository. Linotes’ own data (settings and the search
            index) can always be recreated and does not need a backup.
          </p>
        </div>
      </PreferenceGroup>

      <PreferenceGroup title="Maintenance">
        <PreferenceRow
          title="Rebuild search index"
          description="Re-reads every note from disk. Use this if search results look out of date."
          control={
            <Button size="sm" disabled={busy} onClick={() => void run(rebuildSearchIndex)}>
              <RefreshCw className="size-3.5" strokeWidth={2} /> Rebuild
            </Button>
          }
        />
        {info && (
          <div className="space-y-1 px-4 py-3 text-xs text-muted">
            <p>
              Settings: <code className="ln-selectable font-mono break-all">{info.configDir}</code>
            </p>
            <p>
              Index and recovered files:{' '}
              <code className="ln-selectable font-mono break-all">{info.dataDir}</code>
            </p>
          </div>
        )}
      </PreferenceGroup>
    </>
  );
}

import { FolderInput, HardDrive, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { chooseNotesFolder, retryOpenLibrary, switchToDefaultNotesFolder } from '@/features/app/lifecycle';
import type { LibraryStatus } from '@/types/domain';

/** Shown when the notes folder can't be opened (e.g. an unplugged drive). */
export function LibraryUnavailable({ status }: { status: LibraryStatus }) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 text-center shadow-soft">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-warning-soft">
          <HardDrive className="size-7 text-warning" strokeWidth={1.6} />
        </div>
        <h1 className="text-lg font-semibold">Your notes folder isn’t available</h1>
        <p className="mt-2 text-sm text-muted">{status.error}</p>
        <code className="ln-selectable mt-3 block rounded-lg bg-app px-3 py-2 font-mono text-xs break-all">
          {status.root}
        </code>
        <p className="mt-3 text-xs text-muted">Nothing has been changed or deleted.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void run(retryOpenLibrary)}>
            <RefreshCw className="size-4" strokeWidth={2} /> Try Again
          </Button>
          <Button disabled={busy} onClick={() => void run(chooseNotesFolder)}>
            <FolderInput className="size-4" strokeWidth={2} /> Choose Another Folder…
          </Button>
          {!status.isDefault && (
            <Button variant="ghost" disabled={busy} onClick={() => void run(switchToDefaultNotesFolder)}>
              Use the Default Folder
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

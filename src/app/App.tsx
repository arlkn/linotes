import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { DialogHost } from '@/components/dialogs/dialog-host';
import { AppShell } from '@/components/layout/app-shell';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { getBackend } from '@/lib/backend';
import { bootstrap } from '@/features/app/lifecycle';
import { useLibrary } from '@/features/notes/store';
import { isTextInput } from '@/features/shortcuts/match';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { LibraryUnavailable } from './library-unavailable';

let started: Promise<void> | null = null;

/** Keep the webview from navigating away and from showing its own context menu on UI chrome. */
function useWebviewGuards() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]');
      if (anchor && !anchor.closest('.ProseMirror')) event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // Editable areas keep the native menu (spelling suggestions, copy/paste).
      if (!isTextInput(target) && !target?.closest('.ProseMirror, .cm-content')) event.preventDefault();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);
}

function PreviewBanner() {
  return (
    <div data-preview-banner className="shrink-0 bg-warning-soft px-4 py-1.5 text-center text-xs text-fg">
      <strong className="font-semibold">Browser preview.</strong> Notes live in memory and are not saved. Run
      the desktop app with <code className="font-mono">npm run tauri dev</code>.
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const status = useLibrary((s) => s.status);
  useGlobalShortcuts();
  useWebviewGuards();

  useEffect(() => {
    started ??= bootstrap();
    void started.finally(() => setReady(true));
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {getBackend().kind === 'memory' && <PreviewBanner />}
        <div className="min-h-0 flex-1">
          {!ready ? (
            <div className="flex h-full items-center justify-center bg-app">
              <div className="flex animate-splash flex-col items-center gap-3">
                <Logo size={7} />
                <span className="text-base font-semibold tracking-tight">Linotes</span>
              </div>
            </div>
          ) : (
            <div className="h-full animate-fade-in">
              {status && !status.ready ? <LibraryUnavailable status={status} /> : <AppShell />}
            </div>
          )}
        </div>
      </div>
      <SettingsDialog />
      <DialogHost />
      <Toaster />
    </TooltipProvider>
  );
}

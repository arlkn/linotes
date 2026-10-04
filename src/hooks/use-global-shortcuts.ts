import { useEffect } from 'react';
import { COMPACT_WIDTH } from '@/components/layout/app-shell';
import { requestQuit } from '@/features/app/lifecycle';
import { useEditorStore } from '@/features/editor/store';
import { createFolder, createNote, setView, toggleFavorite } from '@/features/notes/actions';
import type { View } from '@/features/notes/views';
import { nextZoom } from '@/features/settings/appearance';
import { useSettings } from '@/features/settings/store';
import { keyName, matches } from '@/features/shortcuts/match';
import { useUi } from '@/features/ui/ui-store';

const VIEW_KEYS: Record<string, View> = {
  '1': { kind: 'all' },
  '2': { kind: 'favorites' },
  '3': { kind: 'recent' },
  '4': { kind: 'trash' },
};

/** Shortcuts that need neither Ctrl nor Alt. */
const PLAIN_KEYS = new Set(['F6', 'F9', 'Escape']);

function modalOpen(): boolean {
  return (
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !==
    null
  );
}

/** Move focus to the next pane (sidebar → list → editor), like GTK's F6. */
function cycleRegions(backwards: boolean): void {
  const regions = [...document.querySelectorAll<HTMLElement>('[data-region]')].filter(
    (r) => r.offsetParent !== null,
  );
  if (regions.length === 0) return;
  const current = regions.findIndex((r) => r.contains(document.activeElement));
  const next = regions[(current + (backwards ? -1 : 1) + regions.length) % regions.length]!;
  const target =
    next.querySelector<HTMLElement>('[aria-current="page"][data-nav-item]') ??
    next.querySelector<HTMLElement>('[role="listbox"]') ??
    next.querySelector<HTMLElement>('.ProseMirror, .cm-content') ??
    next.querySelector<HTMLElement>('button, [tabindex="0"], textarea, input');
  target?.focus();
}

/** Application-wide shortcuts. Editor formatting shortcuts are handled by the editors. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const ctrl = event.ctrlKey || event.metaKey;
      // Plain typing is never a shortcut; skip the work below on every key press.
      if (!ctrl && !event.altKey && !PLAIN_KEYS.has(event.key)) return;
      const settings = useSettings.getState();
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      // Quitting and settings work even with a dialog open.
      if (matches(event, { key: 'q', ctrl: true })) return run(() => void requestQuit());
      if (modalOpen()) return;

      const key = keyName(event);

      if (matches(event, { key: 'n', ctrl: true })) return run(() => void createNote());
      if (matches(event, { key: 'n', ctrl: true, shift: true })) return run(() => void createFolder(''));
      if (matches(event, { key: 'f', ctrl: true })) return run(() => useUi.getState().focusSearch());
      if (matches(event, { key: 'p', ctrl: true }))
        return run(() => useUi.getState().setQuickSwitcherOpen(true));
      if (matches(event, { key: 's', ctrl: true })) return run(() => void useEditorStore.getState().save());
      if (matches(event, { key: ',', ctrl: true })) return run(() => useUi.getState().openSettings());
      if (matches(event, { key: 'm', ctrl: true, shift: true })) {
        return run(() => {
          const { session, setMode } = useEditorStore.getState();
          if (session && !session.trashed) setMode(session.mode === 'rich' ? 'markdown' : 'rich');
        });
      }
      if (matches(event, { key: 'd', ctrl: true })) {
        return run(() => {
          const id = useEditorStore.getState().session?.id;
          if (id) void toggleFavorite(id);
        });
      }
      if (ctrl && !event.altKey && (key === '+' || key === '=' || event.code === 'NumpadAdd')) {
        return run(() => void settings.update({ uiZoom: nextZoom(settings.settings.uiZoom, 1) }));
      }
      if (ctrl && !event.altKey && (key === '-' || event.code === 'NumpadSubtract')) {
        return run(() => void settings.update({ uiZoom: nextZoom(settings.settings.uiZoom, -1) }));
      }
      if (ctrl && !event.altKey && !event.shiftKey && (key === '0' || event.code === 'Numpad0')) {
        return run(() => void settings.update({ uiZoom: 100 }));
      }
      if (event.altKey && !ctrl && !event.shiftKey && VIEW_KEYS[key]) {
        return run(() => setView(VIEW_KEYS[key]!));
      }
      if (event.key === 'F9' || matches(event, { key: '\\', ctrl: true })) {
        return run(() => {
          if (window.innerWidth < COMPACT_WIDTH) {
            const ui = useUi.getState();
            ui.setSidebarOverlay(!ui.sidebarOverlayOpen);
          } else {
            void settings.update({ sidebarCollapsed: !settings.settings.sidebarCollapsed });
          }
        });
      }
      if (event.key === 'F6') return run(() => cycleRegions(event.shiftKey));
      if (event.key === 'Escape' && !ctrl) {
        const inEditor = document.activeElement?.closest('[data-region="editor"]');
        if (useUi.getState().sidebarOverlayOpen) return run(() => useUi.getState().setSidebarOverlay(false));
        if (inEditor) return run(() => useUi.getState().focusList());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

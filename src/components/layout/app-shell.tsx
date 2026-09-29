import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EditorPane } from '@/components/editor/editor-pane';
import { NotesPane } from '@/components/notes/notes-pane';
import { Sidebar } from '@/components/sidebar/sidebar';
import { useSettings } from '@/features/settings/store';
import { useUi } from '@/features/ui/ui-store';
import { ResizeHandle } from './resize-handle';
import { useWindowWidth } from './use-window-width';

/** Below this width (CSS px) the sidebar becomes an overlay. */
export const COMPACT_WIDTH = 960;
const EDITOR_MIN = 360;

const rem = (px: number) => `${px / 16}rem`;

/** Three-pane window: sidebar | notes list | editor. */
export function AppShell() {
  const { sidebarWidth, listWidth, sidebarCollapsed, uiZoom } = useSettings(
    useShallow((s) => ({
      sidebarWidth: s.settings.sidebarWidth,
      listWidth: s.settings.listWidth,
      sidebarCollapsed: s.settings.sidebarCollapsed,
      uiZoom: s.settings.uiZoom,
    })),
  );
  const update = useSettings((s) => s.update);
  const overlayOpen = useUi((s) => s.sidebarOverlayOpen);
  const setOverlay = useUi((s) => s.setSidebarOverlay);
  const [sidebarDrag, setSidebarDrag] = useState<number | null>(null);
  const [listDrag, setListDrag] = useState<number | null>(null);

  const windowWidth = useWindowWidth();
  const scale = uiZoom / 100;
  const available = windowWidth / scale;
  const compact = windowWidth < COMPACT_WIDTH;
  const sidebarVisible = !compact && !sidebarCollapsed;
  const sidebar = sidebarDrag ?? sidebarWidth;
  const listMax = Math.max(240, available - (sidebarVisible ? sidebar : 0) - EDITOR_MIN);
  const list = Math.min(listDrag ?? listWidth, listMax);

  return (
    <div className="relative flex h-full min-h-0 bg-app">
      {sidebarVisible && (
        <>
          <aside data-region="sidebar" className="h-full shrink-0" style={{ width: rem(sidebar) }}>
            <Sidebar />
          </aside>
          <ResizeHandle
            label="Resize sidebar"
            value={sidebar}
            min={180}
            max={400}
            scale={scale}
            onChange={setSidebarDrag}
            onCommit={(value) => {
              setSidebarDrag(null);
              void update({ sidebarWidth: value });
            }}
          />
        </>
      )}
      <section data-region="list" aria-label="Notes" className="h-full shrink-0" style={{ width: rem(list) }}>
        <NotesPane sidebarHidden={!sidebarVisible} />
      </section>
      <ResizeHandle
        label="Resize notes list"
        value={list}
        min={240}
        max={Math.min(560, listMax)}
        scale={scale}
        onChange={setListDrag}
        onCommit={(value) => {
          setListDrag(null);
          void update({ listWidth: value });
        }}
      />
      <main data-region="editor" className="h-full min-w-0 flex-1">
        <EditorPane />
      </main>

      {!sidebarVisible && overlayOpen && (
        <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Library">
          <div
            className="h-full w-[16.5rem] border-r border-line shadow-popover animate-pop-in"
            data-region="sidebar"
          >
            <Sidebar onNavigate={() => setOverlay(false)} />
          </div>
          <button
            type="button"
            aria-label="Close sidebar"
            className="flex-1 bg-black/25 animate-fade-in"
            onClick={() => setOverlay(false)}
          />
        </div>
      )}
    </div>
  );
}

import { create } from 'zustand';

export type SettingsSection = 'appearance' | 'editor' | 'storage' | 'shortcuts' | 'about';

/** Transient UI state that is not persisted. */
interface UiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  /** The "go to note" box (Ctrl+P). */
  quickSwitcherOpen: boolean;
  /** Sidebar shown as an overlay on narrow windows. */
  sidebarOverlayOpen: boolean;
  /** Incremented to ask the search field to take focus. */
  searchFocusNonce: number;
  /** Incremented to ask the notes list to take focus. */
  listFocusNonce: number;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setSettingsSection(section: SettingsSection): void;
  setQuickSwitcherOpen(open: boolean): void;
  setSidebarOverlay(open: boolean): void;
  focusSearch(): void;
  focusList(): void;
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  settingsSection: 'appearance',
  quickSwitcherOpen: false,
  sidebarOverlayOpen: false,
  searchFocusNonce: 0,
  listFocusNonce: 0,
  openSettings: (section) =>
    set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setQuickSwitcherOpen: (quickSwitcherOpen) => set({ quickSwitcherOpen }),
  setSidebarOverlay: (sidebarOverlayOpen) => set({ sidebarOverlayOpen }),
  focusSearch: () => set((s) => ({ searchFocusNonce: s.searchFocusNonce + 1 })),
  focusList: () => set((s) => ({ listFocusNonce: s.listFocusNonce + 1 })),
}));

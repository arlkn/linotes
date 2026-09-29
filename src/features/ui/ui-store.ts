import { create } from 'zustand';

export type SettingsSection = 'appearance' | 'editor' | 'storage' | 'shortcuts' | 'about';

/** Transient UI state that is not persisted. */
interface UiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  /** Sidebar shown as an overlay on narrow windows. */
  sidebarOverlayOpen: boolean;
  /** Incremented to ask the search field to take focus. */
  searchFocusNonce: number;
  /** Incremented to ask the notes list to take focus. */
  listFocusNonce: number;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setSettingsSection(section: SettingsSection): void;
  setSidebarOverlay(open: boolean): void;
  focusSearch(): void;
  focusList(): void;
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  settingsSection: 'appearance',
  sidebarOverlayOpen: false,
  searchFocusNonce: 0,
  listFocusNonce: 0,
  openSettings: (section) =>
    set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setSidebarOverlay: (sidebarOverlayOpen) => set({ sidebarOverlayOpen }),
  focusSearch: () => set((s) => ({ searchFocusNonce: s.searchFocusNonce + 1 })),
  focusList: () => set((s) => ({ listFocusNonce: s.listFocusNonce + 1 })),
}));

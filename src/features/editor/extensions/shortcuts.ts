import { Extension } from '@tiptap/core';

export interface EditorShortcutOptions {
  /** Ctrl+K: open the link dialog. */
  onLink: () => void;
}

export const EditorShortcuts = Extension.create<EditorShortcutOptions>({
  name: 'linotesShortcuts',

  addOptions() {
    return { onLink: () => {} };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.options.onLink();
        return true;
      },
    };
  },
});

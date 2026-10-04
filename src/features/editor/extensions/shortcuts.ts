import { Extension } from '@tiptap/core';

export interface EditorShortcutOptions {
  /** Ctrl+K: open the link dialog. */
  onLink: () => void;
  /** Esc: leave the editor (back to the notes list). ProseMirror cancels Escape, so the app never sees it. */
  onEscape: () => void;
}

export const EditorShortcuts = Extension.create<EditorShortcutOptions>({
  name: 'linotesShortcuts',

  addOptions() {
    return { onLink: () => {}, onEscape: () => {} };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.options.onLink();
        return true;
      },
      Escape: () => {
        this.options.onEscape();
        return true;
      },
    };
  },
});

/** Keyboard shortcuts, shown in Settings → Shortcuts and in tooltips. */

export interface ShortcutInfo {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutInfo[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Notes',
    shortcuts: [
      { keys: ['Ctrl', 'N'], description: 'New note' },
      { keys: ['Ctrl', 'Shift', 'N'], description: 'New folder' },
      { keys: ['Ctrl', 'S'], description: 'Save now' },
      { keys: ['Ctrl', 'D'], description: 'Add to or remove from favorites' },
      { keys: ['Delete'], description: 'Move selected note to Trash (in the notes list)' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'P'], description: 'Go to a note by title' },
      { keys: ['Ctrl', 'F'], description: 'Search notes' },
      { keys: ['↑', '↓'], description: 'Move between notes or search results' },
      { keys: ['Enter'], description: 'Edit the selected note' },
      { keys: ['Esc'], description: 'Clear search / back to the notes list' },
      { keys: ['Alt', '1…4'], description: 'All Notes, Favorites, Recently Edited, Trash' },
      { keys: ['F6'], description: 'Move focus between sidebar, list and editor' },
      { keys: ['F9'], description: 'Show or hide the sidebar' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Switch between rich text and Markdown' },
      { keys: ['Ctrl', 'K'], description: 'Insert or edit link' },
      { keys: ['Ctrl', 'Click'], description: 'Open link in your browser' },
      { keys: ['Shift', 'Enter'], description: 'Line break' },
      { keys: ['Ctrl', 'Shift', 'V'], description: 'Paste without formatting' },
      { keys: ['Ctrl', 'V'], description: 'Paste an image' },
    ],
  },
  {
    title: 'Formatting',
    shortcuts: [
      { keys: ['Ctrl', 'B'], description: 'Bold' },
      { keys: ['Ctrl', 'I'], description: 'Italic' },
      { keys: ['Ctrl', 'U'], description: 'Underline' },
      { keys: ['Ctrl', 'Shift', 'S'], description: 'Strikethrough' },
      { keys: ['Ctrl', 'E'], description: 'Inline code' },
      { keys: ['Ctrl', 'Alt', '1…3'], description: 'Heading 1–3' },
      { keys: ['Ctrl', 'Alt', '0'], description: 'Normal text' },
      { keys: ['Ctrl', 'Shift', '8'], description: 'Bulleted list' },
      { keys: ['Ctrl', 'Shift', '7'], description: 'Numbered list' },
      { keys: ['Ctrl', 'Shift', '9'], description: 'Checklist' },
      { keys: ['Ctrl', 'Shift', 'B'], description: 'Quote' },
      { keys: ['Ctrl', 'Alt', 'C'], description: 'Code block' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['Ctrl', '+'], description: 'Zoom in' },
      { keys: ['Ctrl', '−'], description: 'Zoom out' },
      { keys: ['Ctrl', '0'], description: 'Reset zoom' },
      { keys: ['Ctrl', ','], description: 'Settings' },
      { keys: ['Ctrl', 'Q'], description: 'Quit' },
    ],
  },
];

/** "Ctrl+Shift+N" for tooltips. */
export function formatKeys(keys: string[]): string {
  return keys.join('+');
}

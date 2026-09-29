import { BulletList, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';

/**
 * Markdown distinguishes "tight" lists (no blank lines between items) from
 * "loose" ones. The attribute is kept on the node so saving a note does not
 * change the spacing of its lists. New lists are tight.
 */
const tight = {
  tight: {
    default: true,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-tight') !== 'false',
    renderHTML: (attributes: Record<string, unknown>) => ({
      'data-tight': attributes.tight ? 'true' : 'false',
    }),
  },
};

export const LinotesBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tight };
  },
});

export const LinotesOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tight };
  },
});

export const LinotesTaskList = TaskList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tight };
  },
});

export const LinotesTaskItem = TaskItem.configure({ nested: true });

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { chooseImageFile } from '@/features/editor/images';
import { normalizeImageSrc } from '@/features/editor/markdown/tokenizer';

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

/** Formatting controls for the rich text editor. */
export function FormattingToolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      editable: e.isEditable,
    }),
  });

  const chain = () => editor.chain().focus();
  const disabled = !state.editable;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-3 py-1.5 [scrollbar-width:none]"
      onKeyDown={(event) => {
        // Arrow keys move between toolbar buttons.
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index === -1) return;
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}
    >
      <IconButton
        label="Heading 1"
        shortcut="Ctrl+Alt+1"
        icon={Heading1}
        active={state.h1}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <IconButton
        label="Heading 2"
        shortcut="Ctrl+Alt+2"
        icon={Heading2}
        active={state.h2}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <IconButton
        label="Heading 3"
        shortcut="Ctrl+Alt+3"
        icon={Heading3}
        active={state.h3}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <IconButton
        label="Bold"
        shortcut="Ctrl+B"
        icon={Bold}
        active={state.bold}
        disabled={disabled}
        onClick={() => chain().toggleBold().run()}
      />
      <IconButton
        label="Italic"
        shortcut="Ctrl+I"
        icon={Italic}
        active={state.italic}
        disabled={disabled}
        onClick={() => chain().toggleItalic().run()}
      />
      <IconButton
        label="Underline"
        shortcut="Ctrl+U"
        icon={Underline}
        active={state.underline}
        disabled={disabled}
        onClick={() => chain().toggleUnderline().run()}
      />
      <IconButton
        label="Strikethrough"
        shortcut="Ctrl+Shift+S"
        icon={Strikethrough}
        active={state.strike}
        disabled={disabled}
        onClick={() => chain().toggleStrike().run()}
      />
      <IconButton
        label="Inline code"
        shortcut="Ctrl+E"
        icon={Code}
        active={state.code}
        disabled={disabled}
        onClick={() => chain().toggleCode().run()}
      />
      <IconButton
        label="Link"
        shortcut="Ctrl+K"
        icon={Link}
        active={state.link}
        disabled={disabled}
        onClick={onLink}
      />
      <IconButton
        label="Drag or add image"
        icon={ImagePlus}
        disabled={disabled}
        onClick={() =>
          void chooseImageFile().then((link) => {
            // The note may have been closed while the file chooser was open.
            if (!link || editor.isDestroyed) return;
            chain()
              .insertContent({ type: 'image', attrs: { src: normalizeImageSrc(link) } })
              .run();
          })
        }
      />
      <Divider />
      <IconButton
        label="Bulleted list"
        shortcut="Ctrl+Shift+8"
        icon={List}
        active={state.bulletList}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      />
      <IconButton
        label="Numbered list"
        shortcut="Ctrl+Shift+7"
        icon={ListOrdered}
        active={state.orderedList}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <IconButton
        label="Checklist"
        shortcut="Ctrl+Shift+9"
        icon={ListTodo}
        active={state.taskList}
        disabled={disabled}
        onClick={() => chain().toggleTaskList().run()}
      />
      <Divider />
      <IconButton
        label="Quote"
        shortcut="Ctrl+Shift+B"
        icon={Quote}
        active={state.blockquote}
        disabled={disabled}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <IconButton
        label="Code block"
        shortcut="Ctrl+Alt+C"
        icon={SquareCode}
        active={state.codeBlock}
        disabled={disabled}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <IconButton
        label="Divider line"
        icon={Minus}
        disabled={disabled}
        onClick={() => chain().setHorizontalRule().run()}
      />
      <Divider />
      <IconButton
        label="Undo"
        shortcut="Ctrl+Z"
        icon={Undo2}
        disabled={disabled || !state.canUndo}
        onClick={() => chain().undo().run()}
      />
      <IconButton
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        icon={Redo2}
        disabled={disabled || !state.canRedo}
        onClick={() => chain().redo().run()}
      />
    </div>
  );
}

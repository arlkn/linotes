import { FileCode, Info, Trash, TriangleAlert } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { describeReasons } from '@/features/editor/markdown/analyze';
import { useEditorStore, type EditorSession } from '@/features/editor/store';
import { restoreNote, selectNote } from '@/features/notes/actions';

function Banner({
  tone,
  icon: Icon,
  children,
  actions,
}: {
  tone: 'info' | 'warning' | 'danger';
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 text-sm',
        tone === 'info' && 'bg-hover',
        tone === 'warning' && 'bg-warning-soft',
        tone === 'danger' && 'bg-danger-soft',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-muted',
        )}
        strokeWidth={2}
      />
      <div className="min-w-[12rem] flex-1">{children}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EditorBanners({ session }: { session: EditorSession }) {
  const { status, error } = useEditorStore(useShallow((s) => ({ status: s.status, error: s.error })));
  const resolveConflict = useEditorStore((s) => s.resolveConflict);
  const recreateMissing = useEditorStore((s) => s.recreateMissing);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  if (session.trashed) {
    return (
      <Banner
        tone="info"
        icon={Trash}
        actions={
          <Button size="sm" onClick={() => void restoreNote(session.id)}>
            Restore
          </Button>
        }
      >
        This note is in the Trash. Restore it to make changes.
      </Banner>
    );
  }

  if (status === 'conflict') {
    return (
      <Banner
        tone="warning"
        icon={TriangleAlert}
        actions={
          <>
            <Button size="sm" onClick={() => void resolveConflict('theirs')}>
              Use Version on Disk
            </Button>
            <Button size="sm" onClick={() => void resolveConflict('copy')}>
              Save Mine as Copy
            </Button>
            <Button size="sm" variant="primary" onClick={() => void resolveConflict('mine')}>
              Keep My Version
            </Button>
          </>
        }
      >
        <strong className="font-semibold">This note was changed outside Linotes</strong> while you had unsaved
        edits. Nothing has been overwritten — choose which version to keep.
      </Banner>
    );
  }

  if (status === 'missing') {
    return (
      <Banner
        tone="warning"
        icon={TriangleAlert}
        actions={
          <>
            <Button size="sm" onClick={() => void selectNote(null)}>
              Close Note
            </Button>
            <Button size="sm" variant="primary" onClick={() => void recreateMissing()}>
              Recreate File
            </Button>
          </>
        }
      >
        <strong className="font-semibold">The file for this note is missing.</strong>{' '}
        {error ?? 'It was moved or deleted outside Linotes.'} Your text is still here.
      </Banner>
    );
  }

  if (session.mode === 'markdown' && session.richBlocked && dismissedFor !== session.id) {
    return (
      <Banner
        tone="info"
        icon={FileCode}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setDismissedFor(session.id)}>
            Dismiss
          </Button>
        }
      >
        Editing as Markdown: this note contains {describeReasons(session.richBlocked)}, which the rich text
        editor can’t show without changing the note.
      </Banner>
    );
  }

  if (status === 'error') {
    return (
      <Banner tone="danger" icon={Info}>
        <strong className="font-semibold">Your latest changes aren’t saved yet.</strong> {error} Linotes will
        keep trying.
      </Banner>
    );
  }

  return null;
}

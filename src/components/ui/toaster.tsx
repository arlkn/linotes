import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useToasts, type Toast } from '@/features/ui/toasts';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, dismiss]);
  const Icon = toast.tone === 'success' ? CircleCheck : toast.tone === 'error' ? TriangleAlert : Info;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-popover animate-toast-in"
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toast.tone === 'success' && 'text-success',
          toast.tone === 'error' && 'text-danger',
          toast.tone === 'info' && 'text-muted',
        )}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.description && (
          <p className="ln-selectable mt-0.5 text-xs break-words text-muted">{toast.description}</p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-sm font-medium text-accent-text hover:bg-hover"
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded-md p-0.5 text-muted hover:bg-hover hover:text-fg"
        onClick={() => dismiss(toast.id)}
      >
        <X className="size-3.5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[70] flex flex-col items-end gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

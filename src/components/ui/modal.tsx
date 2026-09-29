import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Hide the visible title (it stays available to screen readers). */
  hideTitle?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
}

/** Centered dialog with a dimmed backdrop, focus trap and Esc to close. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideTitle,
  onOpenAutoFocus,
}: ModalProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/35 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
          <D.Content
            onOpenAutoFocus={onOpenAutoFocus}
            className={cn(
              'pointer-events-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-popover animate-pop-in focus:outline-none',
              className,
            )}
          >
            <D.Title className={cn('px-5 pt-5 text-base font-semibold', hideTitle && 'sr-only')}>
              {title}
            </D.Title>
            {description ? (
              <D.Description className="px-5 pt-1.5 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">
                {typeof title === 'string' ? title : 'Dialog'}
              </D.Description>
            )}
            {children}
          </D.Content>
        </div>
      </D.Portal>
    </D.Root>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-4">{children}</div>;
}

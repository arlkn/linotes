import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={600} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-app shadow-popover animate-fade-in"
        >
          {label}
          {shortcut && <span className="font-normal opacity-65">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

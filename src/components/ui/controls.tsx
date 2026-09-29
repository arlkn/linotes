import { Switch as S, ToggleGroup as TG } from 'radix-ui';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <S.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-[1.125rem]" />
    </S.Root>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** A row of mutually exclusive options (keyboard: arrow keys). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-app p-0.5"
    >
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <TG.Item
          key={optionValue}
          value={optionValue}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium text-muted transition-colors hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-soft',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm',
          )}
        >
          {Icon && <Icon className="size-3.5" strokeWidth={2} />}
          {optionLabel}
        </TG.Item>
      ))}
    </TG.Root>
  );
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-line bg-app px-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft',
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line border-b-2 bg-surface px-1.5 font-sans text-xs font-medium text-fg">
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent',
        className,
      )}
    />
  );
}

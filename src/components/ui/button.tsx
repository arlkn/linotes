import type { ComponentProps, ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45';

const variants: Record<Variant, string> = {
  default: 'border border-line bg-surface text-fg shadow-soft hover:bg-hover active:bg-active',
  primary: 'bg-accent text-accent-fg shadow-soft hover:bg-accent-strong active:bg-accent-strong',
  ghost: 'text-fg hover:bg-hover active:bg-active',
  danger: 'bg-danger text-white shadow-soft hover:opacity-90 active:opacity-85',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[0.8rem]',
  md: 'h-8 px-3 text-sm',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  shortcut?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  iconClassName?: string;
}

/** Square icon button with an accessible label and a tooltip. */
export function IconButton({
  label,
  icon: Icon,
  shortcut,
  active,
  size = 'md',
  tooltipSide = 'bottom',
  className,
  iconClassName,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg active:bg-active disabled:pointer-events-none disabled:opacity-40',
          size === 'sm' ? 'size-7' : 'size-8',
          active && 'bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text',
          className,
        )}
        {...props}
      >
        <Icon className={cn(size === 'sm' ? 'size-4' : 'size-[1.1rem]', iconClassName)} strokeWidth={1.8} />
      </button>
    </Tooltip>
  );
}

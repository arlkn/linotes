import { ContextMenu as C, DropdownMenu as D } from 'radix-ui';
import type { ComponentType, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

const contentClass =
  'z-50 min-w-[210px] overflow-hidden rounded-xl border border-line bg-surface p-1 text-sm text-fg shadow-popover animate-pop-in';
const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-hover';
const separatorClass = 'my-1 h-px bg-line';
const labelClass = 'px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted';

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

interface ItemProps {
  icon?: Icon;
  children: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

function ItemBody({
  icon: IconComponent,
  children,
  shortcut,
}: Pick<ItemProps, 'icon' | 'children' | 'shortcut'>) {
  return (
    <>
      {IconComponent ? (
        <IconComponent className="size-4 shrink-0 opacity-80" strokeWidth={1.8} />
      ) : (
        <span className="w-4" />
      )}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-xs text-muted">{shortcut}</span>}
    </>
  );
}

// ----- Dropdown menus ---------------------------------------------------------

export const Menu = D.Root;
export const MenuTrigger = D.Trigger;

export function MenuContent({
  children,
  align = 'end',
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <D.Portal>
      <D.Content align={align} sideOffset={6} collisionPadding={8} className={contentClass}>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function MenuItem({ icon, children, shortcut, danger, disabled, onSelect }: ItemProps) {
  return (
    <D.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, danger && 'text-danger')}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </D.Item>
  );
}

export function MenuSeparator() {
  return <D.Separator className={separatorClass} />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <D.Label className={labelClass}>{children}</D.Label>;
}

export function MenuRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <D.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </D.RadioGroup>
  );
}

export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <D.RadioItem value={value} className={itemClass}>
      <span className="flex w-4 justify-center">
        <D.ItemIndicator>
          <Check className="size-4 text-accent-text" strokeWidth={2.2} />
        </D.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </D.RadioItem>
  );
}

// ----- Context menus ----------------------------------------------------------

export const ContextMenu = C.Root;
export const ContextMenuTrigger = C.Trigger;

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <C.Portal>
      <C.Content collisionPadding={8} className={contentClass}>
        {children}
      </C.Content>
    </C.Portal>
  );
}

export function ContextMenuItem({ icon, children, shortcut, danger, disabled, onSelect }: ItemProps) {
  return (
    <C.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, danger && 'text-danger')}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </C.Item>
  );
}

export function ContextMenuSeparator() {
  return <C.Separator className={separatorClass} />;
}

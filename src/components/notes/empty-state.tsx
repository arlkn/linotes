import type { ComponentType, ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft">
        <Icon className="size-7 text-accent-text" strokeWidth={1.6} />
      </div>
      <h3 className="text-[0.95rem] font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-[17rem] text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

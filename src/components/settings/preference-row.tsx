import type { ReactNode } from 'react';

/** GNOME-style "boxed list" group. */
export function PreferenceGroup({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-7">
      {title && <h3 className="mb-1 text-sm font-semibold">{title}</h3>}
      {description && <p className="mb-2.5 text-xs text-muted">{description}</p>}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-app">
        {children}
      </div>
    </section>
  );
}

export function PreferenceRow({
  title,
  description,
  control,
  htmlFor,
}: {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {title}
        </label>
        {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
      </div>
      {control && <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div>}
    </div>
  );
}

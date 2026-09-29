import { Fragment } from 'react';
import { Kbd } from '@/components/ui/controls';
import { SHORTCUT_GROUPS } from '@/features/shortcuts/definitions';
import { PreferenceGroup } from './preference-row';

export function ShortcutsSection() {
  return (
    <>
      {SHORTCUT_GROUPS.map((group) => (
        <PreferenceGroup key={group.title} title={group.title}>
          {group.shortcuts.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
            >
              <span>{shortcut.description}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                {shortcut.keys.map((key, i) => (
                  <Fragment key={key}>
                    {i > 0 && <span aria-hidden>+</span>}
                    <Kbd>{key}</Kbd>
                  </Fragment>
                ))}
              </span>
            </div>
          ))}
        </PreferenceGroup>
      ))}
    </>
  );
}

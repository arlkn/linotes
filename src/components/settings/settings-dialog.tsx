import { Dialog as D } from 'radix-ui';
import { HardDrive, Info, Keyboard, Palette, PencilLine, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/button';
import { useUi, type SettingsSection } from '@/features/ui/ui-store';
import { AboutSection } from './about-section';
import { AppearanceSection } from './appearance-section';
import { EditorSection } from './editor-section';
import { ShortcutsSection } from './shortcuts-section';
import { StorageSection } from './storage-section';

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: PencilLine },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const section = useUi((s) => s.settingsSection);
  const setSection = useUi((s) => s.setSettingsSection);
  const close = useUi((s) => s.closeSettings);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;

  return (
    <D.Root open={open} onOpenChange={(next) => !next && close()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/35 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
          <D.Content className="pointer-events-auto flex h-[min(42rem,calc(100vh-2rem))] w-full max-w-[52rem] overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-popover animate-pop-in focus:outline-none">
            <nav
              aria-label="Settings sections"
              className="flex w-52 shrink-0 flex-col gap-px border-r border-line bg-sidebar p-2 max-sm:w-14"
            >
              <D.Title className="px-2.5 pt-2 pb-3 text-base font-semibold max-sm:sr-only">Settings</D.Title>
              <D.Description className="sr-only">Linotes preferences</D.Description>
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={id === section ? 'page' : undefined}
                  onClick={() => setSection(id)}
                  title={label}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors',
                    id === section ? 'bg-active font-medium' : 'hover:bg-hover',
                  )}
                >
                  <Icon
                    className={cn('size-4 shrink-0', id === section ? 'text-accent-text' : 'text-muted')}
                    strokeWidth={1.8}
                  />
                  <span className="truncate max-sm:hidden">{label}</span>
                </button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-13 shrink-0 items-center justify-between border-b border-line pr-3 pl-6">
                <h2 className="text-[0.95rem] font-semibold">{current.label}</h2>
                <D.Close asChild>
                  <IconButton label="Close settings" icon={X} />
                </D.Close>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-2">
                {section === 'appearance' && <AppearanceSection />}
                {section === 'editor' && <EditorSection />}
                {section === 'storage' && <StorageSection />}
                {section === 'shortcuts' && <ShortcutsSection />}
                {section === 'about' && <AboutSection />}
              </div>
            </div>
          </D.Content>
        </div>
      </D.Portal>
    </D.Root>
  );
}

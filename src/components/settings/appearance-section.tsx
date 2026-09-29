import { Check, Minus, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { Button, IconButton } from '@/components/ui/button';
import { ACCENT_COLORS, nextZoom } from '@/features/settings/appearance';
import { useSettings } from '@/features/settings/store';
import { ACCENTS, type ThemePreference } from '@/types/domain';
import { PreferenceGroup, PreferenceRow } from './preference-row';

function ThemePreview({ variant }: { variant: 'light' | 'dark' | 'system' }) {
  const pane = (dark: boolean) => (
    <div className={cn('flex h-full flex-1', dark ? 'bg-[#1b1b1b]' : 'bg-[#faf9f6]')}>
      <div className={cn('w-1/4', dark ? 'bg-[#222]' : 'bg-[#f3f1ec]')} />
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-accent" />
        <div className={cn('h-1 w-full rounded-full', dark ? 'bg-[#3a3a3a]' : 'bg-[#e5e1dc]')} />
        <div className={cn('h-1 w-2/3 rounded-full', dark ? 'bg-[#3a3a3a]' : 'bg-[#e5e1dc]')} />
      </div>
    </div>
  );
  return (
    <div className="flex h-16 overflow-hidden rounded-lg">
      {variant === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(variant === 'dark')
      )}
    </div>
  );
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Follow System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSection() {
  const { theme, accent, uiZoom, editorFontSize } = useSettings(
    useShallow((s) => ({
      theme: s.settings.theme,
      accent: s.settings.accent,
      uiZoom: s.settings.uiZoom,
      editorFontSize: s.settings.editorFontSize,
    })),
  );
  const update = useSettings((s) => s.update);

  return (
    <>
      <PreferenceGroup title="Style">
        <div role="radiogroup" aria-label="Style" className="grid grid-cols-3 gap-3 p-4">
          {THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => void update({ theme: value })}
              className="group flex flex-col gap-2 text-left"
            >
              <div
                className={cn(
                  'rounded-xl border-2 p-0.5 transition-colors',
                  theme === value ? 'border-accent' : 'border-line group-hover:border-line-strong',
                )}
              >
                <ThemePreview variant={value} />
              </div>
              <span className="flex items-center gap-1.5 text-sm">
                {theme === value && <Check className="size-3.5 text-accent-text" strokeWidth={2.5} />}
                {label}
              </span>
            </button>
          ))}
        </div>
      </PreferenceGroup>

      <PreferenceGroup title="Accent Color">
        <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-3 p-4">
          {ACCENTS.map((name) => {
            const { color, label } = ACCENT_COLORS[name];
            const selected = accent === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                title={label}
                onClick={() => void update({ accent: name })}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                  selected ? 'ring-2 ring-fg/60' : 'hover:ring-2 hover:ring-line-strong',
                )}
                style={{ backgroundColor: color }}
              >
                {selected && <Check className="size-4 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </PreferenceGroup>

      <PreferenceGroup title="Text">
        <PreferenceRow
          title="Interface zoom"
          description="Ctrl+Plus and Ctrl+Minus zoom everything; Ctrl+0 resets."
          control={
            <>
              <IconButton
                label="Zoom out"
                icon={Minus}
                size="sm"
                onClick={() => void update({ uiZoom: nextZoom(uiZoom, -1) })}
              />
              <span className="w-12 text-center text-sm tabular-nums">{uiZoom}%</span>
              <IconButton
                label="Zoom in"
                icon={Plus}
                size="sm"
                onClick={() => void update({ uiZoom: nextZoom(uiZoom, 1) })}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={uiZoom === 100}
                onClick={() => void update({ uiZoom: 100 })}
              >
                Reset
              </Button>
            </>
          }
        />
        <PreferenceRow
          title="Editor text size"
          htmlFor="ln-font-size"
          description="Size of note text in the editor."
          control={
            <>
              <input
                id="ln-font-size"
                type="range"
                min={12}
                max={28}
                step={1}
                value={editorFontSize}
                onChange={(e) => void update({ editorFontSize: Number(e.target.value) })}
                className="w-36 accent-[var(--ln-accent)]"
              />
              <span className="w-10 text-right text-sm tabular-nums">{editorFontSize}px</span>
            </>
          }
        />
      </PreferenceGroup>
    </>
  );
}

import { FileCode, Type } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Segmented, Switch } from '@/components/ui/controls';
import { useSettings } from '@/features/settings/store';
import type { EditorMode } from '@/types/domain';
import { PreferenceGroup, PreferenceRow } from './preference-row';

export function EditorSection() {
  const { defaultEditorMode, spellcheck, autosave } = useSettings(
    useShallow((s) => ({
      defaultEditorMode: s.settings.defaultEditorMode,
      spellcheck: s.settings.spellcheck,
      autosave: s.settings.autosave,
    })),
  );
  const update = useSettings((s) => s.update);

  return (
    <>
      <PreferenceGroup title="Editing">
        <PreferenceRow
          title="Default editing mode"
          description="Notes containing tables, images or HTML always open as Markdown so nothing is lost."
          control={
            <Segmented<EditorMode>
              label="Default editing mode"
              value={defaultEditorMode}
              onChange={(mode) => void update({ defaultEditorMode: mode })}
              options={[
                { value: 'rich', label: 'Rich text', icon: Type },
                { value: 'markdown', label: 'Markdown', icon: FileCode },
              ]}
            />
          }
        />
        <PreferenceRow
          title="Check spelling"
          htmlFor="ln-spellcheck"
          description="Underline misspelled words while you type."
          control={
            <Switch
              id="ln-spellcheck"
              label="Check spelling"
              checked={spellcheck}
              onCheckedChange={(v) => void update({ spellcheck: v })}
            />
          }
        />
      </PreferenceGroup>

      <PreferenceGroup title="Saving">
        <PreferenceRow
          title="Save while typing"
          htmlFor="ln-autosave"
          description="When off, notes are saved with Ctrl+S — and always when you switch notes or close Linotes."
          control={
            <Switch
              id="ln-autosave"
              label="Save while typing"
              checked={autosave}
              onCheckedChange={(v) => void update({ autosave: v })}
            />
          }
        />
      </PreferenceGroup>
    </>
  );
}

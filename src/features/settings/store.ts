import { create } from 'zustand';
import { errorMessage, getBackend } from '@/lib/backend';
import { DEFAULT_SETTINGS } from '@/lib/backend/memory';
import type { Settings, SettingsPatch } from '@/types/domain';
import { toast } from '@/features/ui/toasts';
import { applyAppearance } from './appearance';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load(): Promise<void>;
  /** Apply immediately, then persist. Reverts and reports if saving fails. */
  update(patch: SettingsPatch): Promise<void>;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const settings = await getBackend().getSettings();
    applyAppearance(settings);
    set({ settings, loaded: true });
  },

  async update(patch) {
    const previous = get().settings;
    const optimistic = { ...previous, ...patch };
    applyAppearance(optimistic);
    set({ settings: optimistic });
    try {
      const saved = await getBackend().updateSettings(patch);
      // Keep any newer optimistic values that arrived while this request was in flight.
      set((state) => ({ settings: { ...saved, ...diff(state.settings, optimistic) } }));
    } catch (error) {
      applyAppearance(previous);
      set({ settings: previous });
      toast.error('Couldn’t save the setting', errorMessage(error));
    }
  },
}));

function diff(current: Settings, sent: Settings): Partial<Settings> {
  const changed: Partial<Settings> = {};
  for (const key of Object.keys(current) as (keyof Settings)[]) {
    if (current[key] !== sent[key]) (changed as Record<string, unknown>)[key] = current[key];
  }
  return changed;
}

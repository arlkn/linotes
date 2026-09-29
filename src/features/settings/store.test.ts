import { beforeEach, describe, expect, it } from 'vitest';
import { setBackend } from '@/lib/backend';
import { createMemoryBackend } from '@/lib/backend/memory';
import { useSettings } from './store';

describe('settings store', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies and persists theme choices across a restart', async () => {
    const backend = createMemoryBackend();
    setBackend(backend);
    await useSettings.getState().load();

    await useSettings.getState().update({ theme: 'dark', accent: 'blue', uiZoom: 120 });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--ln-accent')).toBe('#0073E5');
    expect(document.documentElement.style.fontSize).toBe('19.2px');

    // "Restart": a fresh store state loaded from the same backend.
    useSettings.setState({ loaded: false });
    await useSettings.getState().load();
    expect(useSettings.getState().settings.theme).toBe('dark');

    await useSettings.getState().update({ theme: 'light' });
    await useSettings.getState().load();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect((await backend.getSettings()).theme).toBe('light');
  });

  it('reverts when saving fails', async () => {
    const backend = createMemoryBackend();
    backend.updateSettings = () => Promise.reject(new Error('disk full'));
    setBackend(backend);
    await useSettings.getState().load();
    const before = useSettings.getState().settings.editorFontSize;
    await useSettings.getState().update({ editorFontSize: before + 4 });
    expect(useSettings.getState().settings.editorFontSize).toBe(before);
  });
});

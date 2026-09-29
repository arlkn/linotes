import { getBackend } from '@/lib/backend';
import type { Accent, Settings } from '@/types/domain';

export const ACCENT_COLORS: Record<Accent, { color: string; strong: string; label: string }> = {
  orange: { color: '#E95420', strong: '#C74616', label: 'Orange' },
  bark: { color: '#787859', strong: '#5E5E44', label: 'Bark' },
  sage: { color: '#657B69', strong: '#4E6152', label: 'Sage' },
  olive: { color: '#4B8501', strong: '#3A6801', label: 'Olive' },
  viridian: { color: '#03875B', strong: '#026A47', label: 'Viridian' },
  prussian: { color: '#308280', strong: '#246563', label: 'Prussian green' },
  blue: { color: '#0073E5', strong: '#005BB5', label: 'Blue' },
  purple: { color: '#7764D8', strong: '#5D4BBD', label: 'Purple' },
  magenta: { color: '#B34CB3', strong: '#933B93', label: 'Magenta' },
  red: { color: '#DA3450', strong: '#B52740', label: 'Red' },
};

export const ZOOM_STEPS = [70, 80, 90, 100, 110, 120, 135, 150, 160] as const;

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(preference: Settings['theme']): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return darkQuery().matches ? 'dark' : 'light';
}

let themeRequest = 0;

/**
 * Match the window frame (GTK title bar) to the interface. The backend resolves
 * "system" from the desktop's own preference, which is more reliable than the
 * web view's guess, and the answer becomes the interface theme too.
 */
function syncWindowTheme(preference: Settings['theme']): void {
  const request = ++themeRequest;
  getBackend()
    .applyWindowTheme(preference, resolveTheme(preference))
    .then((theme) => {
      if (request === themeRequest) document.documentElement.dataset.theme = theme;
    })
    .catch(() => {
      // Keep the web view's guess; the window frame keeps its current theme.
    });
}

/** Apply theme, accent, zoom and editor size to the document root. */
export function applyAppearance(
  settings: Pick<Settings, 'theme' | 'accent' | 'uiZoom' | 'editorFontSize'>,
): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.theme);
  syncWindowTheme(settings.theme);
  const accent = ACCENT_COLORS[settings.accent] ?? ACCENT_COLORS.orange;
  root.style.setProperty('--ln-accent', accent.color);
  root.style.setProperty('--ln-accent-strong', accent.strong);
  // Everything is sized in rem, so the root font size is the interface zoom.
  root.style.fontSize = `${(16 * settings.uiZoom) / 100}px`;
  root.style.setProperty('--ln-editor-font-size', `${settings.editorFontSize / 16}rem`);
}

/** Re-apply when the system switches between light and dark. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0]!;
}

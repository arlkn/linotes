import { useSettings } from '@/features/settings/store';
import { cn } from '@/lib/cn';

// Pre-scaled by scripts/logo-sizes.py: WebKitGTK shrinks large images roughly, so
// each size comes from its own file. The dark set has a faint rim that keeps the
// black penguin visible on the dark background.
const files = import.meta.glob<string>('../../../assets/logo/mark-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function srcSet(variant: 'light' | 'dark'): string {
  return Object.entries(files)
    .flatMap(([path, url]) => {
      const match = /mark-(light|dark)-(\d+)\.png$/.exec(path);
      return match?.[1] === variant ? [{ url, width: Number(match[2]) }] : [];
    })
    .sort((a, b) => a.width - b.width)
    .map(({ url, width }) => `${url} ${width}w`)
    .join(', ');
}

const LIGHT = srcSet('light');
const DARK = srcSet('dark');

/** The Linotes mark (the same artwork as the app icon), `size` rem square. */
export function Logo({ size, className }: { size: number; className?: string }) {
  // Interface zoom scales rem, which `sizes` does not see, so pass the real pixel size.
  const zoom = useSettings((s) => s.settings.uiZoom);
  const pixels = Math.round((size * 16 * zoom) / 100);
  const image = { alt: '', width: pixels, height: pixels, sizes: `${pixels}px`, draggable: false } as const;
  const box = `${size}rem`;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0', className)}
      style={{ width: box, height: box }}
    >
      <img {...image} srcSet={LIGHT} className="block size-full dark:hidden" />
      <img {...image} srcSet={DARK} className="hidden size-full dark:block" />
    </span>
  );
}

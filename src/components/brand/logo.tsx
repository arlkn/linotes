import { useSettings } from '@/features/settings/store';
import { cn } from '@/lib/cn';

// Pre-scaled by scripts/logo-sizes.py: WebKitGTK shrinks large images roughly,
// so each display size comes from its own file.
const files = import.meta.glob<string>('../../../assets/logo/mark-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const sources = Object.entries(files)
  .map(([path, url]) => ({ url, width: Number(/mark-(\d+)\.png$/.exec(path)?.[1]) }))
  .sort((a, b) => a.width - b.width);
const SRC_SET = sources.map(({ url, width }) => `${url} ${width}w`).join(', ');
const FALLBACK = sources.at(-1)?.url;

/** The Linotes mark (the same artwork as the app icon), `size` rem square. */
export function Logo({ size, className }: { size: number; className?: string }) {
  // Interface zoom scales rem, which `sizes` does not see, so pass the real pixel size.
  const zoom = useSettings((s) => s.settings.uiZoom);
  const pixels = Math.round((size * 16 * zoom) / 100);
  return (
    <img
      src={FALLBACK}
      srcSet={SRC_SET}
      sizes={`${pixels}px`}
      width={pixels}
      height={pixels}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: `${size}rem`, height: `${size}rem` }}
      // In dark mode a hairline rim keeps the black penguin visible against the background.
      className={cn('shrink-0 dark:[filter:drop-shadow(0_0_1px_rgb(255_255_255/0.35))]', className)}
    />
  );
}

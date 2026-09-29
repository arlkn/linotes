import iconUrl from '../../../assets/linotes-icon-256.png';

/** The Linotes mark (the same artwork as the app icon). */
export function Logo({ className }: { className?: string }) {
  return <img src={iconUrl} alt="" aria-hidden="true" draggable={false} className={className} />;
}

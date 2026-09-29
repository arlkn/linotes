import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/** Current viewport width in CSS pixels (after interface zoom). */
export function useWindowWidth(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 1200,
  );
}

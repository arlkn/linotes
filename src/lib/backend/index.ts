import { createMemoryBackend } from './memory';
import { createTauriBackend } from './tauri';
import type { Backend } from './types';

export type { Backend, Unlisten } from './types';
export { BackendError, errorMessage, isErrorKind, toBackendError } from './errors';

/** Whether the page runs inside the Tauri desktop shell (vs. a plain browser preview). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let current: Backend | null = null;

export function getBackend(): Backend {
  current ??= isTauri() ? createTauriBackend() : createMemoryBackend({ seed: true });
  return current;
}

/** Replace the backend (tests). */
export function setBackend(backend: Backend): void {
  current = backend;
}

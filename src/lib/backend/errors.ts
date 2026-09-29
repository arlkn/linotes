import type { ErrorKind } from '@/types/domain';

/** An error reported by the backend, with a machine-readable kind. */
export class BackendError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'BackendError';
    this.kind = kind;
  }
}

const KINDS: readonly ErrorKind[] = [
  'notFound',
  'invalidInput',
  'alreadyExists',
  'conflict',
  'fileMissing',
  'unavailable',
  'io',
  'database',
  'internal',
];

export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error as { kind: unknown; message: unknown };
    const known = KINDS.includes(kind as ErrorKind) ? (kind as ErrorKind) : 'internal';
    return new BackendError(known, String(message));
  }
  if (error instanceof Error) return new BackendError('internal', error.message);
  return new BackendError('internal', String(error));
}

export function isErrorKind(error: unknown, kind: ErrorKind): boolean {
  return error instanceof BackendError && error.kind === kind;
}

/** A human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  return toBackendError(error).message || 'Something went wrong.';
}

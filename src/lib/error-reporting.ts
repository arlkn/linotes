import { isTauri } from './backend';

/**
 * Write uncaught frontend errors to the Linotes log file
 * (~/.local/share/<app id>/logs), so problems can be diagnosed without devtools.
 * Nothing leaves the computer.
 */
export function installErrorReporting(): void {
  if (!isTauri()) return;
  const send = (message: string) => {
    void import('@tauri-apps/plugin-log').then(({ error }) => error(message)).catch(() => {});
  };
  window.addEventListener('error', (event) => {
    send(`[frontend] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.message}\n${event.reason.stack ?? ''}`
        : String(event.reason);
    send(`[frontend] Unhandled rejection: ${reason}`);
  });
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    send(
      `[frontend] ${args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' ')}`,
    );
  };
}

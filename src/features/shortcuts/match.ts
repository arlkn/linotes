export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Layout-aware key name. Uses the produced character when it is ASCII so
 * shortcuts follow the user's layout (e.g. AZERTY), and falls back to the
 * physical key for non-Latin layouts (Cyrillic, Greek…) and for keys like
 * Turkish "ı", mirroring how ProseMirror resolves editor shortcuts.
 */
export function keyName(event: KeyboardEvent): string {
  const key = event.key;
  if (key.length === 1 && key.charCodeAt(0) < 128) return key.toLowerCase();
  if (key.length === 1) {
    const code = event.code;
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
  }
  return key;
}

export function matches(event: KeyboardEvent, combo: KeyCombo): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  return (
    keyName(event) === combo.key.toLowerCase() &&
    ctrl === Boolean(combo.ctrl) &&
    event.shiftKey === Boolean(combo.shift) &&
    event.altKey === Boolean(combo.alt)
  );
}

/** Whether focus is in a text field where plain keys (Delete, arrows) must not be intercepted. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

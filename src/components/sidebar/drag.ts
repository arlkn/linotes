/** Drag-and-drop of notes onto folders and views. */
export const NOTE_DRAG_TYPE = 'application/x-linotes-note';

export function isNoteDrag(event: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(event.dataTransfer?.types.includes(NOTE_DRAG_TYPE));
}

export function draggedNoteId(event: { dataTransfer: DataTransfer | null }): string | null {
  return event.dataTransfer?.getData(NOTE_DRAG_TYPE) || null;
}

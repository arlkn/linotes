import { create } from 'zustand';
import type { ImportReport } from '@/types/domain';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  /** Return an error message to block submission. */
  validate?: (value: string) => string | null;
}

export interface FolderPickerOptions {
  title: string;
  confirmLabel: string;
  /** Folder to mark as current. */
  current?: string;
}

export type DialogRequest =
  | ({ kind: 'confirm'; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; resolve: (value: string | null) => void } & PromptOptions)
  | ({ kind: 'folderPicker'; resolve: (path: string | null) => void } & FolderPickerOptions)
  | { kind: 'importReport'; report: ImportReport; resolve: () => void };

interface DialogState {
  queue: DialogRequest[];
  open(request: DialogRequest): void;
  close(): void;
}

export const useDialogs = create<DialogState>()((set) => ({
  queue: [],
  open(request) {
    set((state) => ({ queue: [...state.queue, request] }));
  },
  close() {
    set((state) => ({ queue: state.queue.slice(1) }));
  },
}));

/** Promise-based dialogs, rendered by <DialogHost />. */
export const dialogs = {
  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => useDialogs.getState().open({ kind: 'confirm', resolve, ...options }));
  },
  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => useDialogs.getState().open({ kind: 'prompt', resolve, ...options }));
  },
  pickFolder(options: FolderPickerOptions): Promise<string | null> {
    return new Promise((resolve) =>
      useDialogs.getState().open({ kind: 'folderPicker', resolve, ...options }),
    );
  },
  importReport(report: ImportReport): Promise<void> {
    return new Promise((resolve) => useDialogs.getState().open({ kind: 'importReport', report, resolve }));
  },
};

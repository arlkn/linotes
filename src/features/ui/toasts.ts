import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push(input) {
    const id = nextId++;
    const duration = input.duration ?? (input.tone === 'error' ? 8000 : 4000);
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...input, id, duration }] }));
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  info: (title: string, description?: string, action?: Toast['action']) =>
    useToasts.getState().push({ title, description, tone: 'info', action }),
  success: (title: string, description?: string, action?: Toast['action']) =>
    useToasts.getState().push({ title, description, tone: 'success', action }),
  error: (title: string, description?: string, action?: Toast['action']) =>
    useToasts.getState().push({ title, description, tone: 'error', action }),
};

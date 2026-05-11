import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const duration = toast.duration ?? 4000;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => set({ toasts: [] }),
}));

// Convenience helpers
export const toast = {
  info: (title: string, message?: string) =>
    useToastStore.getState().addToast({ kind: "info", title, message }),
  success: (title: string, message?: string) =>
    useToastStore.getState().addToast({ kind: "success", title, message }),
  warn: (title: string, message?: string) =>
    useToastStore.getState().addToast({ kind: "warning", title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().addToast({ kind: "error", title, message }),
};
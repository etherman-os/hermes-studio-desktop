import React from "react";
import { useToastStore, type Toast } from "../../stores/toastStore";
import { X } from "lucide-react";

const TOAST_ICONS: Record<Toast["kind"], string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

const TOAST_CLASS: Record<Toast["kind"], string> = {
  info: "toast-info",
  success: "toast-success",
  warning: "toast-warning",
  error: "toast-error",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className={`toast-item ${TOAST_CLASS[toast.kind]}`} role="alert">
      <span className="toast-icon" aria-hidden="true">{TOAST_ICONS[toast.kind]}</span>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button
        className="toast-close"
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
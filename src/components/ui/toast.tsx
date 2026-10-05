"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

export type NotifyHelper = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

type ToastContextValue = {
  /** Low-level toast. Prefer `notify.success/error/warning/info`. */
  toast: (input: ToastInput) => void;
  /** Single helper for transient notifications. Tones map to site tokens. */
  notify: NotifyHelper;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return context;
}

/** Shorthand for `useToast().notify`. */
export function useNotify(): NotifyHelper {
  return useToast().notify;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, title: input.title, description: input.description, tone: input.tone ?? "info" }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const notify: NotifyHelper = {
    success: (title, description) => toast({ title, description, tone: "success" }),
    error: (title, description) => toast({ title, description, tone: "error" }),
    warning: (title, description) => toast({ title, description, tone: "warning" }),
    info: (title, description) => toast({ title, description, tone: "info" }),
  };

  return (
    <ToastContext.Provider value={{ toast, notify }}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast-${item.tone}`}
            role={item.tone === "error" ? "alert" : "status"}
          >
            <div className="toast-title">{item.title}</div>
            {item.description && <div className="toast-desc">{item.description}</div>}
            <button type="button" className="toast-dismiss" onClick={() => dismiss(item.id)} aria-label="Dismiss notification">
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

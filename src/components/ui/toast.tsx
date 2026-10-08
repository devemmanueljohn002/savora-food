"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "warning" | "info" | "loading";

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
  /** Persistent spinner toast. Returns a dismiss function. */
  loading: (title: string, description?: string) => () => void;
  /**
   * Wrap a promise: shows loading, then success/error. Resolves with the
   * original value so callers can keep chaining.
   */
  promise: <T>(
    task: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => Promise<T>;
};

type ToastContextValue = {
  /** Low-level toast. Prefer `notify.success/error/warning/info/loading`. */
  toast: (input: ToastInput) => () => void;
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

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, tone: ToastTone) => {
      if (tone === "loading") return;
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const pauseDismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const tone = input.tone ?? "info";
      setItems((current) => [...current, { id, title: input.title, description: input.description, tone }]);
      scheduleDismiss(id, tone);
      return () => dismiss(id);
    },
    [dismiss, scheduleDismiss],
  );

  // Global Escape dismisses the newest toast. Focus stays where it was —
  // toasts never steal focus, they only announce via live regions.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const region = document.querySelector("[data-toast-region]");
      const dismissButton = region?.querySelector<HTMLButtonElement>(".toast-dismiss");
      dismissButton?.click();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const notify: NotifyHelper = {
    success: (title, description) => {
      toast({ title, description, tone: "success" });
    },
    error: (title, description) => {
      toast({ title, description, tone: "error" });
    },
    warning: (title, description) => {
      toast({ title, description, tone: "warning" });
    },
    info: (title, description) => {
      toast({ title, description, tone: "info" });
    },
    loading: (title, description) => toast({ title, description, tone: "loading" }),
    promise: async (task, messages) => {
      const stop = toast({ title: messages.loading, tone: "loading" });
      try {
        const value = await task;
        stop();
        toast({ title: messages.success, tone: "success" });
        return value;
      } catch (error) {
        stop();
        toast({ title: messages.error, tone: "error" });
        throw error;
      }
    },
  };

  return (
    <ToastContext.Provider value={{ toast, notify }}>
      {children}
      {/* Polite region for status/info, assertive region for errors so screen
          readers interrupt. Loading toasts announce politely with a spinner. */}
      <div className="toast-region" data-toast-region aria-live="polite" aria-atomic="false">
        {items
          .filter((item) => item.tone !== "error")
          .map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              onDismiss={() => dismiss(item.id)}
              onPause={() => pauseDismiss(item.id)}
              onResume={() => scheduleDismiss(item.id, item.tone)}
            />
          ))}
      </div>
      <div className="toast-region toast-region-alert" data-toast-region-alert aria-live="assertive" aria-atomic="true">
        {items
          .filter((item) => item.tone === "error")
          .map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              onDismiss={() => dismiss(item.id)}
              onPause={() => pauseDismiss(item.id)}
              onResume={() => scheduleDismiss(item.id, item.tone)}
            />
          ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
  onPause,
  onResume,
}: {
  item: ToastItem;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const isAlert = item.tone === "error";
  return (
    <div
      className={`toast toast-${item.tone}`}
      role={isAlert ? "alert" : "status"}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      <div className="toast-title">
        {item.tone === "loading" && (
          <span className="btn-spinner toast-spinner" aria-hidden="true" />
        )}
        {item.title}
      </div>
      {item.description && <div className="toast-desc">{item.description}</div>}
      <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss notification (Esc)">
        &times;
      </button>
    </div>
  );
}

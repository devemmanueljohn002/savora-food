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

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Orange (default) or red destructive action. */
  danger?: boolean;
};

type PendingConfirm = ConfirmOptions & { key: number };

type ConfirmContextValue = {
  /** Themed replacement for window.confirm. Resolves true on confirm. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue["confirm"] {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return context.confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const keyRef = useRef(1);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPending({ ...options, key: keyRef.current++ });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setPending(null);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") settle(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="modal-backdrop" onClick={() => settle(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={pending.body ? "confirm-body" : undefined}
            style={{ maxWidth: 440 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2 className="modal-title" id="confirm-title">
                {pending.title}
              </h2>
            </div>
            <div className="modal-body">
              {pending.body && (
                <p className="muted" id="confirm-body" style={{ marginTop: 0 }}>
                  {pending.body}
                </p>
              )}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  ref={cancelRef}
                  type="button"
                  className="btn secondary"
                  style={{ minHeight: 44 }}
                  onClick={() => settle(false)}
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  className={pending.danger ? "btn danger" : "btn"}
                  style={{ minHeight: 44 }}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

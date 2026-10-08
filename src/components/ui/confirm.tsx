"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ConfirmState {
  open: boolean;
  title?: string;
  message?: string;
  body?: string; // legacy alias for message
  onConfirm: () => void;
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  danger?: boolean; // legacy alias for variant="danger"
  loading?: boolean;
}

type ConfirmFn = (options: Partial<Omit<ConfirmState, "open">>) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({ open: false, message: "", onConfirm: () => {}, onClose: () => {} });

  const showConfirm: ConfirmFn = (options) => {
    return new Promise((resolve) => {
      setState({
        ...options,
        open: true,
        message: options.message ?? options.body,
        variant: options.danger ? "danger" : options.variant,
        onConfirm: () => {
          resolve(true);
        },
        onClose: () => {
          resolve(false);
        },
      });
    });
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      {state.open && (
        <ConfirmDialog
          open={state.open}
          onClose={() => setState((prev) => ({ ...prev, open: false }))}
          onConfirm={() => {
            state.onConfirm();
            setState((prev) => ({ ...prev, open: false }));
          }}
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          variant={state.variant}
          loading={state.loading}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return context;
}

// Inline dialog to avoid circular dependency
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
}: ConfirmState) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="confirm-title" className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close dialog">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer" style={{ display: "flex", gap: "8px", justifyContent: "flex-end", padding: "16px 22px", borderTop: "1px solid var(--line)" }}>
          <button type="button" className="btn secondary" onClick={handleClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${variant === "danger" ? "danger" : variant === "warning" ? "danger" : ""}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <span className="btn-spinner" aria-hidden="true" role="status" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
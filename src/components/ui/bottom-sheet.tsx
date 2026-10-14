"use client";

import { useEffect, type ReactNode } from "react";

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/**
 * Bottom sheet on mobile, centered dialog on desktop.
 * Esc closes; backdrop click closes; close button has an aria-label.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h3 className="sheet-title">{title}</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close dialog">
            &times;
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { type ElementType, type ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  as?: ElementType;
  className?: string;
  /** Compact one-line variant: small icon + single line, no big card. */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, as = "div", className = "", compact = false }: EmptyStateProps) {
  const Tag = as;
  if (compact) {
    return (
      <Tag className={["empty-compact", className].filter(Boolean).join(" ")}>
        {icon && (
          <span className="empty-compact-ico" aria-hidden="true">
            {icon}
          </span>
        )}
        <span>
          {title}
          {description ? <span className="empty-compact-desc"> — {description}</span> : null}
        </span>
        {action}
      </Tag>
    );
  }
  return (
    <Tag className={["empty-state", className].filter(Boolean).join(" ")}>
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </Tag>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, action, className = "", dismissible = false, onDismiss }: ErrorStateProps) {
  return (
    <div className={["error-state", className].filter(Boolean).join(" ")} role="alert">
      {dismissible && onDismiss && (
        <button type="button" className="error-state-dismiss" onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      )}
      <div className="error-state-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-message">{message}</p>
      {action && <div className="error-state-action">{action}</div>}
    </div>
  );
}
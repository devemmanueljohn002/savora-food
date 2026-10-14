"use client";

import { type ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
}

/** Page title (20–22px mobile, 26px desktop) + optional sub + actions row. */
export function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}

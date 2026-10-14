"use client";

import Link from "next/link";
import { type ReactNode } from "react";

export interface ListRowProps {
  href?: string;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}

/**
 * One tappable list row: optional leading icon, title + meta lines,
 * right-aligned slot (price/badge). Renders <a>, <button> or <div>.
 */
export function ListRow({ href, title, meta, right, icon, onClick }: ListRowProps) {
  const inner = (
    <>
      {icon ? (
        <span className="list-row-ico" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="list-row-main">
        <span className="list-row-title">{title}</span>
        {meta ? <span className="list-row-meta">{meta}</span> : null}
      </span>
      {right ? <span className="list-row-right">{right}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="list-row">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="list-row">
        {inner}
      </button>
    );
  }
  return <div className="list-row">{inner}</div>;
}

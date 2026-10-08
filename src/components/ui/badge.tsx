"use client";

import { HTMLAttributes, forwardRef } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClass: Record<BadgeTone, string> = {
  neutral: "badge",
  success: "badge badge-success",
  warning: "badge badge-warning",
  danger: "badge badge-danger",
  info: "badge badge-info",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = "neutral", className = "", children, ...rest }, ref) => {
    return (
      <span ref={ref} className={[toneClass[tone], className].filter(Boolean).join(" ")} {...rest}>
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";
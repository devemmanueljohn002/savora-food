import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: "badge",
  success: "badge badge-success",
  warning: "badge badge-warning",
  danger: "badge badge-danger",
  info: "badge badge-info",
};

export function Badge({ tone = "neutral", className = "", children, ...rest }: BadgeProps) {
  return (
    <span className={[toneClass[tone], className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
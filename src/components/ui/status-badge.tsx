"use client";

import { HTMLAttributes } from "react";

export type StatusTone = "success" | "warning" | "neutral" | "danger" | "info";

const toneClass: Record<StatusTone, string> = {
  success: "badge badge-success",
  warning: "badge badge-warning",
  neutral: "badge badge-neutral",
  danger: "badge badge-danger",
  info: "badge badge-info",
};

const SUCCESS = new Set([
  "DELIVERED", "SUCCESS", "SUCCESSFUL", "APPROVED", "ACTIVE", "VERIFIED",
  "PAID", "COMPLETED", "OPEN",
]);

const WARNING = new Set([
  "PENDING", "PENDING_PAYMENT", "SUBMITTED", "UNDER_REVIEW", "PROCESSING",
  "OTP", "PREPARING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "OUT_FOR_DELIVERY",
  "VENDOR_ACCEPTED", "CONFIRMED", "QUOTED", "ONLINE",
]);

const NEUTRAL = new Set([
  "CANCELLED", "REFUNDED", "REJECTED", "SUSPENDED", "INACTIVE", "OFFLINE", "CLOSED",
]);

const DANGER = new Set(["FAILED", "EXPIRED"]);

/** Sentence-case label for a status code ("OUT_FOR_DELIVERY" → "Out for delivery"). */
export function statusLabel(status: string): string {
  const words = status.toLowerCase().split("_");
  const label = words.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  if (status === "SUCCESS") return "Successful";
  if (status === "OTP") return "Needs approval";
  if (status === "VENDOR_ACCEPTED") return "Accepted";
  return label;
}

/**
 * Tone for a status code. Green = success, amber = needs action/pending,
 * neutral grey = cancelled (never red), red = failed/error only.
 */
export function statusTone(status: string): StatusTone {
  if (SUCCESS.has(status)) return "success";
  if (WARNING.has(status)) return "warning";
  if (NEUTRAL.has(status)) return "neutral";
  if (DANGER.has(status)) return "danger";
  return "info";
}

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
  label?: string;
  tone?: StatusTone;
}

/** Soft-background badge, 12px semibold, sentence case. */
export function StatusBadge({ status, label, tone, className = "", ...rest }: StatusBadgeProps) {
  return (
    <span className={[toneClass[tone ?? statusTone(status)], className].filter(Boolean).join(" ")} {...rest}>
      {label ?? statusLabel(status)}
    </span>
  );
}

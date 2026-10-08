"use client";

import { CSSProperties, type ElementType } from "react";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  animation?: "pulse" | "wave" | "none";
}

export function Skeleton({
  className = "",
  style,
  variant = "rectangular",
  width,
  height,
  animation = "wave",
}: SkeletonProps) {
  const classes = [
    "skeleton",
    `skeleton-${variant}`,
    animation !== "none" && `skeleton-${animation}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={{
        ...style,
        width: width ?? (variant === "circular" ? "1rem" : "100%"),
        height: height ?? (variant === "text" ? "1rem" : "1rem"),
      }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={className}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" width="100%" />
      ))}
    </div>
  );
}

export interface SkeletonCardProps {
  className?: string;
  image?: boolean;
  lines?: number;
}

export function SkeletonCard({ className = "", image = true, lines = 3 }: SkeletonCardProps) {
  return (
    <div className={["card card-static skeleton-card", className].filter(Boolean).join(" ")}>
      {image && <Skeleton className="skeleton-card-image" width="100%" height={176} />}
      <div className="card-body">
        <SkeletonText lines={lines} />
        <Skeleton variant="rectangular" width="40%" style={{ marginTop: "1rem" }} />
      </div>
    </div>
  );
}
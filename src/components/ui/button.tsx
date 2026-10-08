"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn",
  secondary: "btn secondary",
  ghost: "btn ghost",
  danger: "btn danger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

/**
 * Consistent button with built-in loading spinner, full-width option,
 * and icon support. All visual styling comes from globals.css (.btn, .btn-*).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      iconPosition = "left",
      fullWidth = false,
      className = "",
      children,
      type = "button",
      ...rest
    },
    ref,
  ) => {
    const classes = [
      variantClass[variant],
      sizeClass[size],
      loading && "is-loading",
      fullWidth && "btn-block",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
      >
        {loading ? (
          <span className="btn-spinner" aria-hidden="true" role="status" />
        ) : (
          <>
            {icon && iconPosition === "left" && <span className="btn-icon" aria-hidden="true">{icon}</span>}
            {children}
            {icon && iconPosition === "right" && <span className="btn-icon" aria-hidden="true">{icon}</span>}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
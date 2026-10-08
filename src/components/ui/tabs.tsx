"use client";

import { useState, type ReactNode, type HTMLAttributes } from "react";

export interface TabsProps {
  items: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "default" | "pills" | "underline";
}

export function Tabs({ items, value, onChange, className = "", variant = "default" }: TabsProps) {
  const baseClass = "tabs";
  const variantClass = variant === "pills" ? "tabs-pills" : variant === "underline" ? "tabs-underline" : "";
  return (
    <div className={[baseClass, variantClass, className].filter(Boolean).join(" ")} role="tablist" aria-label="Tabs">
      {items.map(({ value, label, disabled }) => (
        <button
          key={value}
          role="tab"
          aria-selected={value === value}
          aria-controls={`panel-${value}`}
          id={`tab-${value}`}
          className={[
            "tab",
            value === value && "tab-active",
            disabled && "tab-disabled",
          ].filter(Boolean).join(" ")}
          onClick={() => !disabled && onChange(value)}
          disabled={disabled}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export interface TabPanelsProps {
  children: ReactNode;
}

export function TabPanels({ children }: TabPanelsProps) {
  return <div className="tab-panels">{children}</div>;
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabPanel({ value, children, className = "", ...rest }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={["tab-panel", className].filter(Boolean).join(" ")}
      hidden={false}
      {...rest}
    >
      {children}
    </div>
  );
}
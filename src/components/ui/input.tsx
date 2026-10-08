"use client";

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className = "", ...rest }, ref) => {
    const classes = ["input", invalid && "input-error", className].filter(Boolean).join(" ");
    return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
  },
);

Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid = false, className = "", ...rest }, ref) => {
    const classes = ["input", "textarea", invalid && "input-error", className].filter(Boolean).join(" ");
    return <textarea ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
  },
);

Textarea.displayName = "Textarea";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid = false, className = "", children, ...rest }, ref) => {
    const classes = ["input", invalid && "input-error", className].filter(Boolean).join(" ");
    return <select ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest}>{children}</select>;
  },
);

Select.displayName = "Select";

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  optional?: boolean;
  required?: boolean;
}

export function Field({ label, htmlFor, error, hint, children, optional = false, required = false }: FieldProps) {
  const id = htmlFor || `field-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function Checkbox({ label, className = "", id, ...rest }: CheckboxProps) {
  const checkboxId = id || `checkbox-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label className={`checkbox-label ${className}`.trim()} htmlFor={checkboxId}>
      <input type="checkbox" id={checkboxId} className="checkbox-input" {...rest} />
      <span className="checkbox-custom" aria-hidden="true" />
      <span className="checkbox-text">{label}</span>
    </label>
  );
}

export interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

export function RadioGroup({ name, value, onChange, options, className = "" }: RadioGroupProps) {
  return (
    <div className={`radio-group ${className}`.trim()} role="radiogroup" aria-labelledby={`${name}-label`}>
      {options.map(({ value: optValue, label }) => (
        <label key={optValue} className="radio-label">
          <input
            type="radio"
            name={name}
            value={optValue}
            checked={value === optValue}
            onChange={() => onChange(optValue)}
            className="radio-input"
          />
          <span className="radio-custom" aria-hidden="true" />
          <span className="radio-text">{label}</span>
        </label>
      ))}
    </div>
  );
}
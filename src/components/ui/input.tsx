import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  const classes = ["input", invalid && "input-error", className].filter(Boolean).join(" ");
  return <input className={classes} aria-invalid={invalid || undefined} {...rest} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ invalid = false, className = "", ...rest }: TextareaProps) {
  const classes = ["input", "textarea", invalid && "input-error", className].filter(Boolean).join(" ");
  return <textarea className={classes} aria-invalid={invalid || undefined} {...rest} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ invalid = false, className = "", children, ...rest }: SelectProps) {
  const classes = ["input", invalid && "input-error", className].filter(Boolean).join(" ");
  return (
    <select className={classes} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

export type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  optional?: boolean;
};

export function Field({ label, htmlFor, error, hint, children, optional = false }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
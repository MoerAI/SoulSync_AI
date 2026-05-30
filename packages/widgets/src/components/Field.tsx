import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

type SharedFieldProps = {
  label: string;
  error?: string;
  helperText?: string;
  textarea?: boolean;
  className?: string;
};

export type FieldProps = SharedFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function Field({ label, error, helperText, textarea = false, id, className, rows = 4, ...props }: FieldProps) {
  const fieldId = id ?? props.name ?? label;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;

  return (
    <label className={cx("ssw-field", className)} htmlFor={fieldId}>
      <span className="ssw-field__label">{label}</span>
      {textarea ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className="ssw-field-control"
          id={fieldId}
          rows={rows}
          {...props}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className="ssw-field-control"
          id={fieldId}
          {...props}
        />
      )}
      {helperText && !error ? (
        <span className="ssw-field__helper" id={helperId}>
          {helperText}
        </span>
      ) : null}
      {error ? (
        <span className="ssw-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

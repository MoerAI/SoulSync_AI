import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx("ssw-button", `ssw-button--${variant}`, `ssw-button--${size}`, className)}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="ssw-button__spinner" /> : null}
      <span>{children}</span>
    </button>
  );
}

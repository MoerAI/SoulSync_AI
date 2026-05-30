import { cx } from "./utils";

export type BadgeVariant = "default" | "synthetic" | "success" | "error";

export type BadgeProps = {
  text: string;
  variant?: BadgeVariant;
  className?: string;
};

export function Badge({ text, variant = "default", className }: BadgeProps) {
  return <span className={cx("ssw-badge", `ssw-badge--${variant}`, className)}>{text}</span>;
}

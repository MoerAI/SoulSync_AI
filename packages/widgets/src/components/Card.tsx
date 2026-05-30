import type { ReactNode } from "react";
import { cx } from "./utils";

export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardProps = {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  header?: ReactNode;
  padding?: CardPadding;
  shadow?: boolean;
};

export function Card({ children, className, footer, header, padding = "md", shadow = true }: CardProps) {
  return (
    <section className={cx("ssw-card", `ssw-card--padding-${padding}`, shadow && "ssw-card--shadow", className)}>
      {header ? <div className="ssw-card__header">{header}</div> : null}
      <div className="ssw-card__body">{children}</div>
      {footer ? <div className="ssw-card__footer">{footer}</div> : null}
    </section>
  );
}

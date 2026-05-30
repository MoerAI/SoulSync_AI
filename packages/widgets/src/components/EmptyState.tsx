import type { ReactNode } from "react";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="ssw-state">
      {icon ? <div className="ssw-state__icon">{icon}</div> : null}
      <h2 className="ssw-state__title">{title}</h2>
      <p className="ssw-state__description">{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

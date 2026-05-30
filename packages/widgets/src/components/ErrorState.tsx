import { Button } from "./Button";

export type ErrorStateProps = {
  title: string;
  description: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, description, retryLabel = "다시 시도", onRetry }: ErrorStateProps) {
  return (
    <div className="ssw-state ssw-state--error" role="alert">
      <h2 className="ssw-state__title">{title}</h2>
      <p className="ssw-state__description">{description}</p>
      {onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}

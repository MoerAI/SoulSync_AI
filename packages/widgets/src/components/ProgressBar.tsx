import { clamp } from "./utils";

export type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const safeValue = clamp(value, 0, 100);

  return (
    <div className="ssw-progress">
      <div className="ssw-progress__label">
        <span>{label ?? "Progress"}</span>
        <span>{safeValue}%</span>
      </div>
      <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={safeValue} className="ssw-progress__track" role="progressbar">
        <div className="ssw-progress__bar" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

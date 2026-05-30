import { clamp } from "./utils";

export type StepperProps = {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
};

export function Stepper({ currentStep, totalSteps, labels = [] }: StepperProps) {
  const safeTotal = Math.max(totalSteps, 1);
  const safeCurrent = clamp(currentStep, 1, safeTotal);
  const steps = Array.from({ length: safeTotal }, (_, index) => index + 1);

  return (
    <div
      aria-label={`Step ${safeCurrent} of ${safeTotal}`}
      className="ssw-stepper"
      style={{ "--ssw-step-count": safeTotal } as React.CSSProperties}
    >
      <div className="ssw-stepper__track">
        {steps.map((step) => (
          <span
            aria-hidden="true"
            className="ssw-stepper__bar"
            key={step}
            style={{ "--ssw-step-active": step <= safeCurrent ? 1 : 0 } as React.CSSProperties}
          />
        ))}
      </div>
      {labels.length > 0 ? (
        <div className="ssw-stepper__labels">
          {steps.map((step) => (
            <span className={step === safeCurrent ? "ssw-stepper__label--active" : undefined} key={step}>
              {labels[step - 1] ?? `Step ${step}`}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

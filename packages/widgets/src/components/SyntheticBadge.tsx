import { Badge } from "./Badge";

export type SyntheticBadgeProps = {
  is_synthetic: boolean;
  className?: string;
};

export function SyntheticBadge({ is_synthetic, className }: SyntheticBadgeProps) {
  if (!is_synthetic) {
    return null;
  }

  return <Badge className={className} text="AI 프로필" variant="synthetic" />;
}

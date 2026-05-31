import { cx } from "./utils";

export type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  const appOrigin = typeof window !== "undefined" && window.__SOULSYNC_APP_ORIGIN__ ? window.__SOULSYNC_APP_ORIGIN__ : "";

  return <img alt="SoulSync AI" className={cx("ssw-brand-logo", className)} decoding="async" src={`${appOrigin}/soulsync-mark.png`} />;
}

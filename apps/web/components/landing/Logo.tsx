type LogoProps = {
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
};

export function Logo({ size = "md", showWord = true }: LogoProps) {
  return (
    <span className={`logo logo-${size}`} role="img" aria-label="SoulSync AI 로고">
      <img className="logo-mark" src="/soulsync-logo.png" alt="" width={96} height={96} />
      {showWord ? <span className="logo-word">SoulSync AI</span> : null}
    </span>
  );
}

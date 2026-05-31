import { Logo } from "./Logo";

const links = [
  { href: "#problem", label: "문제" },
  { href: "#solution", label: "솔루션" },
  { href: "#how", label: "작동 방식" },
  { href: "#architecture", label: "아키텍처" },
  { href: "#tools", label: "도구" },
  { href: "#widget", label: "위젯" },
  { href: "#demo", label: "데모" }
];

export function Nav() {
  return (
    <header className="site-header">
      <nav className="container nav-shell" aria-label="주요 섹션">
        <a href="#hero" aria-label="SoulSync AI 홈으로 이동">
          <Logo size="sm" />
        </a>
        <div className="nav-links" aria-label="페이지 섹션 링크">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <a className="button button-primary" href="#demo">
          라이브 데모
        </a>
      </nav>
    </header>
  );
}

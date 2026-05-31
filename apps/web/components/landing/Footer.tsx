import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-layout">
        <div className="footer-brand">
          <Logo size="md" />
          <p>AI 페르소나가 먼저 만나보는 새로운 데이팅 경험</p>
          <p className="copyright">© 2026 SoulSync AI · Weekendthon</p>
        </div>
        <div className="footer-chips" aria-label="프로젝트 기술 태그">
          <span className="chip">🐙 github.com/.../pairsona</span>
          <span className="chip">ChatGPT Apps SDK</span>
          <span className="chip">MCP</span>
          <span className="chip">EXAONE</span>
          <span className="chip">Supabase</span>
        </div>
      </div>
    </footer>
  );
}

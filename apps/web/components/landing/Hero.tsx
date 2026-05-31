import { Logo } from "./Logo";
import { Reveal } from "./Reveal";

export function Hero() {
  return (
    <section id="hero" className="hero-section" aria-labelledby="hero-title">
      <span className="blob blob-one" aria-hidden="true" />
      <span className="blob blob-two" aria-hidden="true" />
      <span className="blob blob-three" aria-hidden="true" />
      <div className="container hero-grid">
        <Reveal className="hero-copy">
          <div className="hero-kicker">
            <Logo size="lg" showWord={false} />
          </div>
          <p className="pill">🚀 ChatGPT Apps SDK · Weekendthon · 2026.05</p>
          <h1 id="hero-title" className="hero-title">
            SoulSync AI
          </h1>
          <p className="hero-subtitle">AI 페르소나가 대신 데이트하는 ChatGPT 앱</p>
          <p className="hero-desc">
            ChatGPT 안에서 시작하고 끝나는 <b>혁신적인 데이팅 경험</b>
          </p>
          <p className="hero-desc">AI가 먼저 대화해보고 궁합을 확인해 매칭해드립니다</p>
          <div className="chip-row" aria-label="핵심 기술">
            <span className="chip">&lt;/&gt; ChatGPT Apps SDK</span>
            <span className="chip">🤖 LG K-EXAONE</span>
            <span className="chip">🗄 GGUI + API Fuse</span>
          </div>
          <div className="hero-actions">
            <a className="button button-primary" href="#demo">
              라이브 데모 보기
            </a>
            <a className="button button-ghost" href="#how">
              작동 방식
            </a>
          </div>
        </Reveal>
        <Reveal className="hero-visual">
          <div className="hero-orbit" aria-hidden="true" />
          <span className="hero-glyph" aria-hidden="true">💬</span>
          <span className="hero-glyph" aria-hidden="true">💞</span>
          <span className="hero-glyph" aria-hidden="true">👥</span>
          <div className="hero-center-card" aria-label="SoulSync AI 매칭 성사율">
            <Logo size="sm" showWord={false} />
            <p className="hero-stat-label">매칭 성사율</p>
            <div className="score-number hero-score">100%</div>
            <p className="tag">AI 페르소나 대화 기반 추천</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

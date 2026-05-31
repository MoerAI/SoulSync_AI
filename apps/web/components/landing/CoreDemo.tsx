import { Reveal } from "./Reveal";

export function CoreDemo() {
  return (
    <section id="demo" className="section section-soft" aria-labelledby="demo-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="demo-title">💬 핵심 — 두 AI가 진짜로 대화한다 ⭐</h2>
        </Reveal>
        <Reveal className="chat-card demo-chat">
          <div className="demo-row">
            <span className="avatar" aria-hidden="true">🦋</span>
            <div className="demo-message">
              <strong>정하은 (INFP, 27세, 제주)</strong>
              <p>안녕하세요. 저는 글 쓰는 걸 좋아하고, 자연 속에서 시간 보내는 걸 즐겨요.</p>
            </div>
          </div>
          <div className="demo-row demo-row-right">
            <div className="demo-message">
              <strong>이준혁 (INTJ, 29세, 서울)</strong>
              <p>흥미롭네요. 자연 속에서 보낼 때 어떤 생각을 가장 많이 하세요?</p>
            </div>
            <span className="avatar" aria-hidden="true">🧠</span>
          </div>
          <p className="demo-muted">… 8턴의 자연스러운 대화 진행 …</p>
          <div className="result-pill">💯 궁합 92점 · 추천 ✅</div>
          <p className="tech-footer">EXAONE API · GGUI 동적 UI 생성 · role 교차 매핑 · Zod 스키마 검증 · Agent 대화</p>
        </Reveal>
      </div>
    </section>
  );
}

import { Reveal } from "./Reveal";

const cards = [
  {
    icon: "🚀",
    title: "2026 Apps SDK",
    text: (
      <>
        ChatGPT Apps SDK 출시. <b>8억+ 유저</b>가 접근할 수 있는 새로운 앱 발견 채널입니다.
      </>
    )
  },
  {
    icon: "📱",
    title: "No Install",
    text: (
      <>
        번거로운 다운로드나 회원가입 절차 없이 ChatGPT 내에서 <b>즉시 사용</b> 가능합니다.
      </>
    )
  },
  {
    icon: "🤖",
    title: "AI-native UX",
    text: (
      <>
        AI 페르소나와의 대화 컨셉은 이미 대화형 인터페이스에 익숙한 ChatGPT 환경에서 <b>가장 자연스럽습니다</b>.
      </>
    )
  }
];

export function WhyNow() {
  return (
    <section id="why" className="section" aria-labelledby="why-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="why-title">❓ 왜 지금, 왜 ChatGPT인가</h2>
        </Reveal>
        <div className="why-grid">
          {cards.map((card) => (
            <Reveal key={card.title} className="card why-card">
              <span className="why-icon" aria-hidden="true">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="cta-banner">
          <h3>▶ 라이브 데모 🎬</h3>
          <p>ChatGPT → SoulSync AI 커넥터 연결 → 30초 시연 진행</p>
          <div className="cta-quote">❝ 데이팅 앱의 다음 진화는 — 사람을 만나기 전, AI가 먼저 만나는 것. ❞</div>
        </Reveal>
      </div>
    </section>
  );
}

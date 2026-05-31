import { Reveal } from "./Reveal";

const features = [
  {
    icon: "🎨",
    title: "Vanilla CSS",
    text: (
      <>
        프레임워크 없이 구축된 <b>22KB 단일 HTML 파일</b>로 매우 가볍게 동작합니다.
      </>
    )
  },
  {
    icon: "📱",
    title: "Mobile-first",
    text: (
      <>
        <b>max-width: 400px</b> 적용으로 ChatGPT iframe 환경에 최적화된 반응형 디자인입니다.
      </>
    )
  },
  {
    icon: "🎭",
    title: "MBTI 이모지 아바타",
    text: "16개 성격 타입 각각에 고유한 이모지를 부여하여 직관성을 높였습니다. (ENFP 🦄, INTJ 🧠)"
  },
  {
    icon: "⚙️",
    title: "5개 상태 머신",
    text: (
      <>
        form → loading → cards → conversation → result 의 <b>매끄러운 화면 전환</b>을 제공합니다.
      </>
    )
  }
];

export function WidgetUX() {
  return (
    <section id="widget" className="section" aria-labelledby="widget-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="widget-title">📱 친숙한 Tinder UX, ChatGPT 안에서 그대로</h2>
          <p>프레임워크 없이 가볍고 직관적인 모바일 최적화 위젯 UI를 제공합니다.</p>
        </Reveal>
        <div className="widget-layout">
          <Reveal className="phone-mockup" aria-label="SoulSync AI 프로필 입력 위젯 목업">
            <div className="phone-header">
              <strong>SoulSync AI</strong>
              <span>AI가 함께하는 나의 소울메이트</span>
            </div>
            <div className="phone-form">
              <div className="phone-field">
                <label>이름</label>
                <span>바나나</span>
              </div>
              <div className="phone-field">
                <label>나이</label>
                <span>29</span>
              </div>
              <div className="phone-field">
                <label>지역</label>
                <span>서울 ▾</span>
              </div>
              <div className="phone-field">
                <label>MBTI</label>
                <span>MBTI 선택 ▾</span>
              </div>
              <span className="phone-help">모든 항목을 입력해주세요.</span>
              <button className="phone-button" type="button">💘 매칭 시작하기</button>
            </div>
          </Reveal>
          <div className="feature-grid">
            {features.map((feature) => (
              <Reveal key={feature.title} className="feature-card">
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

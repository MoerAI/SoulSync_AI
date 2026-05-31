import { Reveal } from "./Reveal";

const rows = [
  ["1", "📝", "프로필 입력 (이름·나이·지역·정보)", "save_profile_step", "120초"],
  ["2", "🤖", "AI 페르소나 자동 생성", "generate_persona", "30초"],
  ["3", "💖", "MBTI 기반 매칭 후보 추천", "start_match_job", "10초"],
  ["4", "💬", "Agent↔Agent 8턴 대화 진행", "get_match_job", "25초"],
  ["5", "❤️", "궁합 결과 + 대화 하이라이트", "list_recommendations", "즉시"]
];

export function HowItWorks() {
  return (
    <section id="how" className="section section-soft" aria-labelledby="how-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="how-title">5단계, 3분이면 끝</h2>
          <p>사용자는 아주 적은 노력만, 나머지는 AI가 모두 처리합니다.</p>
        </Reveal>
        <div className="timeline">
          {rows.map(([number, icon, label, tool, duration]) => (
            <Reveal key={number} className="timeline-row">
              <span className="timeline-number">{number}</span>
              <span className="timeline-icon" aria-hidden="true">{icon}</span>
              <span className="timeline-label">{label}</span>
              <span className="tool-code">{tool}</span>
              <span className="duration">{duration}</span>
            </Reveal>
          ))}
        </div>
        <Reveal className="footer-note">
          ✏️ 사용자는 <b>프로필 정보 입력 → 카드 보고 Like</b> 누르면 끝. 나머지는 AI가 다 합니다.
        </Reveal>
      </div>
    </section>
  );
}

import { Reveal } from "./Reveal";

const tools = [
  ["📝", "save_profile_step", "이름·나이·지역·MBTI 등 프로필을 단계별로 저장·업데이트합니다. (세션 기반 upsert)"],
  ["🤖", "generate_persona", "프로필을 기반으로 friendli.ai EXAONE으로 AI 페르소나를 자동 생성합니다."],
  ["💖", "start_match_job", "MBTI 소프트필터 → 에이전트 대화 → 심사로 이어지는 매칭 잡을 시작합니다."],
  ["🔄", "get_match_job", "매칭 잡의 진행 상태와 완료된 궁합 결과를 조회(폴링)합니다."],
  ["📊", "list_recommendations", "궁합 점수와 대화 하이라이트가 담긴 추천 목록을 조회합니다."],
  ["🪪", "get_profile_card", "GGUI로 생성된 상대 프로필 카드를 조회합니다."]
];

export function Tools() {
  return (
    <section id="tools" className="section section-soft" aria-labelledby="tools-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="tools-title">🧰 6가지 핵심 MCP Tool</h2>
          <p>프로필 입력부터 추천까지, 전체 14개 표준 MCP 도구 중 핵심 6가지입니다.</p>
        </Reveal>
        <div className="tools-grid">
          {tools.map(([icon, name, description]) => (
            <Reveal key={name} className="tool-card">
              <span className="card-icon" aria-hidden="true">{icon}</span>
              <h3>{name}</h3>
              <p>{description}</p>
              <span className="tool-code">{name}</span>
            </Reveal>
          ))}
        </div>
        <Reveal className="footer-note">✅ MCP 표준 = ChatGPT가 자연어로 호출 ✓ · 위젯이 직접 호출 ✓</Reveal>
      </div>
    </section>
  );
}

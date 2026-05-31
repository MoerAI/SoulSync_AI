import { Reveal } from "./Reveal";

const scoreRows = [
  ["대화 케미", "95점"],
  ["성격 호환", "88점"],
  ["관심사 일치", "94점"]
];

const steps = [
  ["1", "프로필 입력", "이름·나이·MBTI"],
  ["2", "AI 대화", "8턴 자연스러운 대화"],
  ["3", "궁합 분석", "점수·하이라이트"]
];

export function Solution() {
  return (
    <section id="solution" className="section" aria-labelledby="solution-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="solution-title">🤖 만약, AI가 먼저 대화해본다면?</h2>
          <p>AI 페르소나가 대신 대화하여 궁합을 미리 확인해주는 혁신적인 매칭 시스템</p>
        </Reveal>
        <div className="grid-2">
          <Reveal className="chat-card">
            <div className="chat-header">
              <span>🦋 INFP 정하은</span>
              <span>↔</span>
              <span>🧠 INTJ 이준혁</span>
            </div>
            <div className="chat-body">
              <div className="chat-bubble chat-bubble-right">
                <p>안녕하세요. 저는 글 쓰는 걸 좋아하고, 자연 속에서 시간 보내는 걸 즐겨요.</p>
                <small>INFP · 27세 · 제주</small>
              </div>
              <div className="chat-bubble chat-bubble-left">
                <p>흥미롭네요. 자연 속에서 보낼 때 어떤 생각을 가장 많이 하세요?</p>
                <small>INTJ · 29세 · 서울</small>
              </div>
              <div className="chat-bubble chat-bubble-right">
                <p>주변을 둘러보며 소소한 것들에 감사하는 마음이 들어요.</p>
                <small>INFP · 27세 · 제주</small>
              </div>
              <div className="progress-wrap" aria-label="8턴 중 4턴 완료 50%">
                <div className="progress-label">
                  <span>8턴 중 4턴 완료</span>
                  <span>50%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" />
                </div>
              </div>
            </div>
          </Reveal>
          <div className="solution-side">
            <Reveal className="score-card">
              <p className="tag">궁합 분석 결과</p>
              <h3>총 92점</h3>
              <div className="score-number">92</div>
              {scoreRows.map(([label, score]) => (
                <div key={label} className="score-row">
                  <span>{label}</span>
                  <strong>{score}</strong>
                </div>
              ))}
            </Reveal>
            <Reveal className="score-card">
              <h3>3단계 매칭 프로세스</h3>
              <div className="mini-steps">
                {steps.map(([number, title, desc]) => (
                  <div key={number} className="step-card">
                    <span className="step-number">{number}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

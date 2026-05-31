import { Reveal } from "./Reveal";

const problems = [
  {
    icon: "📷",
    title: "📸 사진 한 장",
    body: (
      <>
        프로필 사진과 키워드 한두 개로 매칭 결정. <b>외모 중심</b>의 과도한 판단으로 진짜 궁합을 놓치고 있습니다.
      </>
    ),
    tag: "외모 70% · 성격 30%"
  },
  {
    icon: "💬",
    title: "💬 만나봐야 안다",
    body: (
      <>
        케미는 대화에서 드러나지만 <b>만나기 전에는 알 수 없음</b>. 소통 가능성을 미리 검증할 방법이 없습니다.
      </>
    ),
    tag: "대화 케미 · 호감도"
  },
  {
    icon: "🕐",
    title: "⏱️ 시간·감정 낭비",
    body: (
      <>
        약속 잡고, 만나고, <b>어색한 채로 끝나는 반복</b>. 매칭 이후의 시간과 감정 손실이 큽니다.
      </>
    ),
    tag: "시간 2시간+ · 감정 소모"
  }
];

export function Problem() {
  return (
    <section id="problem" className="section section-soft" aria-labelledby="problem-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="problem-title">⚠️ 데이팅 앱, 매번 헛걸음하는 이유</h2>
          <p>기존 데이팅 앱의 3가지 핵심 문제점</p>
        </Reveal>
        <div className="grid-3">
          {problems.map((problem) => (
            <Reveal key={problem.title} className="card">
              <span className="card-icon" aria-hidden="true">{problem.icon}</span>
              <h3>{problem.title}</h3>
              <p>{problem.body}</p>
              <span className="tag">{problem.tag}</span>
            </Reveal>
          ))}
        </div>
        <Reveal className="quote-bar">
          ❝ 프로필은 첫인상만 알려준다. <b className="coral-text">진짜 궁합은 대화에서 드러난다.</b> SoulSync AI는 이 간극을 해결합니다.
        </Reveal>
        <div className="stats-row" aria-label="기존 데이팅 앱 pain-point 통계">
          <Reveal className="stat-card">
            <span>👥 매칭 성공률</span>
            <strong>12%</strong>
          </Reveal>
          <Reveal className="stat-card">
            <span>❤️ 만족도</span>
            <strong>23%</strong>
          </Reveal>
          <Reveal className="stat-card">
            <span>🕐 평균 매칭 시간</span>
            <strong>3일</strong>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

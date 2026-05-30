export type MbtiAxis = "EI" | "SN" | "TF" | "JP";
export type MbtiDirection = "positive" | "negative";
export type PrivacyClass = "public" | "matching_private" | "internal";

export type ReligionType = "무교" | "기독교" | "천주교" | "불교" | "이슬람교" | "기타";

export type QuestionCategory = "mbti" | "religion_values" | "appeal_subjective";
export type QuestionInputType = "single" | "multi" | "scale" | "text";

export type MbtiOptionScoring = {
  axis: MbtiAxis;
  direction: MbtiDirection;
  weight: number;
};

export type QuestionOption = {
  id: string;
  label: string;
  value: string | number;
  scoring?: MbtiOptionScoring;
};

export type Question = {
  id: string;
  category: QuestionCategory;
  prompt: string;
  inputType: QuestionInputType;
  privacyClass: PrivacyClass;
  options?: readonly QuestionOption[];
  metadata?: {
    axis?: MbtiAxis;
    valueType?: "religion_type" | "religion_intensity" | "values" | "salary" | "location" | "job" | "lifestyle";
  };
};

export const MBTI_AXES = ["EI", "SN", "TF", "JP"] as const satisfies readonly MbtiAxis[];

export const RELIGION_TYPES = ["무교", "기독교", "천주교", "불교", "이슬람교", "기타"] as const satisfies readonly ReligionType[];

export const RELIGION_INTENSITY_SCALE = [
  { value: 1, label: "명목/비실천" },
  { value: 2, label: "가끔 참여" },
  { value: 3, label: "보통 실천" },
  { value: 4, label: "꾸준히 실천" },
  { value: 5, label: "독실/적극실천" }
] as const;

export const SALARY_BANDS = ["3천만 미만", "3-5천만", "5-8천만", "8천만+", "비공개"] as const;

export const LOCATION_OPTIONS = [
  "서울 강남구",
  "서울 서초구",
  "서울 송파구",
  "서울 마포구",
  "서울 용산구",
  "서울 성동구",
  "서울 영등포구",
  "서울 종로구",
  "경기 성남시",
  "경기 수원시",
  "경기 고양시",
  "경기 용인시",
  "경기 부천시",
  "경기 안양시",
  "인천 연수구",
  "인천 남동구",
  "부산 해운대구",
  "부산 수영구",
  "대구 수성구",
  "광주 서구",
  "대전 유성구",
  "울산 남구",
  "세종시"
] as const;

const option = (id: string, label: string, axis: MbtiAxis, direction: MbtiDirection, weight = 1): QuestionOption => ({
  id,
  label,
  value: id,
  scoring: { axis, direction, weight }
});

const singleOptions = (values: readonly string[]): readonly QuestionOption[] =>
  values.map((value, index) => ({ id: `${index + 1}`, label: value, value }));

export const QUESTIONS = [
  {
    id: "mbti_ei_01",
    category: "mbti",
    prompt: "새로운 모임에 가면 나는 보통 어떤 편인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "EI" },
    options: [
      option("e", "먼저 말을 걸며 분위기를 익힌다", "EI", "positive", 2),
      option("i", "몇 사람과 조용히 대화하며 익힌다", "EI", "negative", 2)
    ]
  },
  {
    id: "mbti_ei_02",
    category: "mbti",
    prompt: "긴 하루가 끝난 뒤 에너지를 회복하는 방식은 무엇에 가깝나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "EI" },
    options: [
      option("e", "사람들과 만나 이야기하며 풀린다", "EI", "positive"),
      option("i", "혼자 쉬거나 익숙한 공간에서 풀린다", "EI", "negative")
    ]
  },
  {
    id: "mbti_ei_03",
    category: "mbti",
    prompt: "데이트 초반의 대화에서 나는 어떤 흐름을 선호하나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "EI" },
    options: [
      option("e", "다양한 주제를 빠르게 오가며 친해진다", "EI", "positive"),
      option("i", "한두 주제를 깊게 나누며 편안해진다", "EI", "negative")
    ]
  },
  {
    id: "mbti_ei_04",
    category: "mbti",
    prompt: "주말 약속을 잡을 때 더 끌리는 선택은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "EI" },
    options: [
      option("e", "새로운 사람이나 장소가 있는 일정", "EI", "positive"),
      option("i", "가까운 사람과 조용히 보내는 일정", "EI", "negative")
    ]
  },
  {
    id: "mbti_ei_05",
    category: "mbti",
    prompt: "상대와 갈등이 생기면 나는 보통 어떻게 정리하나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "EI" },
    options: [
      option("e", "말하면서 생각을 정리한다", "EI", "positive"),
      option("i", "혼자 생각한 뒤 차분히 말한다", "EI", "negative")
    ]
  },
  {
    id: "mbti_sn_01",
    category: "mbti",
    prompt: "상대를 알아갈 때 먼저 눈에 들어오는 것은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "SN" },
    options: [
      option("s", "말과 행동에서 보이는 구체적인 습관", "SN", "negative", 2),
      option("n", "그 사람이 가진 가능성과 방향", "SN", "positive", 2)
    ]
  },
  {
    id: "mbti_sn_02",
    category: "mbti",
    prompt: "데이트 계획을 세울 때 더 마음이 놓이는 쪽은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "SN" },
    options: [
      option("s", "시간, 장소, 비용이 구체적인 계획", "SN", "negative"),
      option("n", "분위기와 가능성을 열어 둔 계획", "SN", "positive")
    ]
  },
  {
    id: "mbti_sn_03",
    category: "mbti",
    prompt: "좋은 대화라고 느끼는 순간은 언제인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "SN" },
    options: [
      option("s", "실제 경험과 현실적인 이야기가 오갈 때", "SN", "negative"),
      option("n", "아이디어와 의미가 넓게 이어질 때", "SN", "positive")
    ]
  },
  {
    id: "mbti_sn_04",
    category: "mbti",
    prompt: "상대의 장점을 설명할 때 내가 자주 보는 면은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "SN" },
    options: [
      option("s", "꾸준함, 책임감, 생활 감각", "SN", "negative"),
      option("n", "상상력, 통찰, 성장 가능성", "SN", "positive")
    ]
  },
  {
    id: "mbti_sn_05",
    category: "mbti",
    prompt: "결혼이나 장기 관계를 떠올릴 때 더 중시하는 것은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "SN" },
    options: [
      option("s", "일상 운영이 잘 맞는지", "SN", "negative"),
      option("n", "함께 그리는 미래상이 맞는지", "SN", "positive")
    ]
  },
  {
    id: "mbti_tf_01",
    category: "mbti",
    prompt: "중요한 결정을 할 때 더 믿는 기준은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "TF" },
    options: [
      option("t", "논리와 일관성", "TF", "positive", 2),
      option("f", "관계와 감정의 영향", "TF", "negative", 2)
    ]
  },
  {
    id: "mbti_tf_02",
    category: "mbti",
    prompt: "상대가 고민을 털어놓을 때 나는 먼저 무엇을 하나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "TF" },
    options: [
      option("t", "문제의 원인과 해결책을 함께 찾는다", "TF", "positive"),
      option("f", "상대의 마음을 먼저 알아주고 공감한다", "TF", "negative")
    ]
  },
  {
    id: "mbti_tf_03",
    category: "mbti",
    prompt: "솔직한 피드백을 주어야 할 때 나는 어떤 편인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "TF" },
    options: [
      option("t", "핵심을 분명히 말하는 편이다", "TF", "positive"),
      option("f", "상대가 상처받지 않도록 표현을 고른다", "TF", "negative")
    ]
  },
  {
    id: "mbti_tf_04",
    category: "mbti",
    prompt: "관계에서 더 중요하다고 느끼는 안정감은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "TF" },
    options: [
      option("t", "서로 합리적인 기준을 지키는 안정감", "TF", "positive"),
      option("f", "서로 따뜻하게 챙겨 주는 안정감", "TF", "negative")
    ]
  },
  {
    id: "mbti_tf_05",
    category: "mbti",
    prompt: "다툼 뒤 화해할 때 가장 도움이 되는 것은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "TF" },
    options: [
      option("t", "무엇이 문제였는지 명확히 정리하기", "TF", "positive"),
      option("f", "서로의 마음을 확인하고 안심시키기", "TF", "negative")
    ]
  },
  {
    id: "mbti_jp_01",
    category: "mbti",
    prompt: "약속을 잡을 때 나는 어떤 방식이 편한가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "JP" },
    options: [
      option("j", "미리 정하고 지키는 방식", "JP", "positive", 2),
      option("p", "상황에 맞게 조정하는 방식", "JP", "negative", 2)
    ]
  },
  {
    id: "mbti_jp_02",
    category: "mbti",
    prompt: "여행을 간다면 더 즐거운 준비 방식은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "JP" },
    options: [
      option("j", "동선과 예약을 미리 맞춰 둔다", "JP", "positive"),
      option("p", "큰 방향만 정하고 현장에서 고른다", "JP", "negative")
    ]
  },
  {
    id: "mbti_jp_03",
    category: "mbti",
    prompt: "생활 리듬이 맞는 상대를 생각할 때 더 중요한 것은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "JP" },
    options: [
      option("j", "규칙적인 습관과 정리된 일정", "JP", "positive"),
      option("p", "유연한 태도와 즉흥적인 즐거움", "JP", "negative")
    ]
  },
  {
    id: "mbti_jp_04",
    category: "mbti",
    prompt: "할 일이 많을 때 나는 보통 어떻게 움직이나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "JP" },
    options: [
      option("j", "목록을 만들고 차례로 끝낸다", "JP", "positive"),
      option("p", "그때그때 중요한 것부터 처리한다", "JP", "negative")
    ]
  },
  {
    id: "mbti_jp_05",
    category: "mbti",
    prompt: "관계의 속도를 정할 때 더 편한 흐름은 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { axis: "JP" },
    options: [
      option("j", "서로 기대를 분명히 맞춰 간다", "JP", "positive"),
      option("p", "자연스럽게 흐름을 보며 맞춰 간다", "JP", "negative")
    ]
  },
  {
    id: "religion_type",
    category: "religion_values",
    prompt: "본인의 종교 또는 신앙 배경을 선택해 주세요.",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "religion_type" },
    options: singleOptions(RELIGION_TYPES)
  },
  {
    id: "religion_intensity",
    category: "religion_values",
    prompt: "종교나 신앙을 생활에서 실천하는 정도는 어느 수준인가요?",
    inputType: "scale",
    privacyClass: "matching_private",
    metadata: { valueType: "religion_intensity" },
    options: RELIGION_INTENSITY_SCALE.map((level) => ({ id: String(level.value), label: level.label, value: level.value }))
  },
  {
    id: "religion_partner_preference",
    category: "religion_values",
    prompt: "상대의 종교나 신앙 배경에 대한 선호는 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["같은 배경이면 좋다", "다르더라도 존중하면 괜찮다", "크게 상관없다"])
  },
  {
    id: "values_family",
    category: "religion_values",
    prompt: "가족과의 관계에서 가장 중요하게 보는 가치는 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["자주 교류하기", "서로의 경계 존중하기", "필요할 때 책임 있게 돕기", "부부 중심의 독립성 지키기"])
  },
  {
    id: "values_marriage",
    category: "religion_values",
    prompt: "장기 관계나 결혼에서 가장 중요하다고 느끼는 가치는 무엇인가요?",
    inputType: "multi",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["신뢰", "성실함", "대화", "경제 감각", "정서적 지지", "성장 의지"])
  },
  {
    id: "values_children",
    category: "religion_values",
    prompt: "자녀 계획에 대한 현재 생각은 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["원한다", "아직 모르겠다", "원하지 않는다", "상대와 충분히 상의하고 싶다"])
  },
  {
    id: "values_finance",
    category: "religion_values",
    prompt: "커플의 돈 관리에서 가장 편한 방식은 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["공동 목표 중심으로 관리", "각자 관리하되 큰 지출은 상의", "소득과 지출을 투명하게 공유", "상황에 맞게 유연하게 조정"])
  },
  {
    id: "values_conflict",
    category: "religion_values",
    prompt: "갈등이 생겼을 때 가장 원하는 해결 방식은 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["바로 대화하기", "시간을 두고 정리한 뒤 대화하기", "규칙을 정해 반복 갈등 줄이기", "감정을 충분히 확인한 뒤 해결하기"])
  },
  {
    id: "values_service",
    category: "religion_values",
    prompt: "봉사, 기부, 공동체 활동에 대한 생각은 무엇인가요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["중요한 삶의 일부다", "기회가 있으면 참여하고 싶다", "개인의 선택이라고 본다", "현재는 우선순위가 낮다"])
  },
  {
    id: "values_alcohol_smoking",
    category: "religion_values",
    prompt: "음주나 흡연에 대한 관계 기준은 무엇에 가깝나요?",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "values" },
    options: singleOptions(["하지 않는 사람을 선호한다", "절제하면 괜찮다", "서로 합의하면 괜찮다", "크게 신경 쓰지 않는다"])
  },
  {
    id: "appeal_location",
    category: "appeal_subjective",
    prompt: "주로 만나기 편한 생활권을 선택해 주세요.",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "location" },
    options: singleOptions(LOCATION_OPTIONS)
  },
  {
    id: "appeal_salary_band",
    category: "appeal_subjective",
    prompt: "본인의 연 소득 구간을 선택해 주세요.",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "salary" },
    options: singleOptions(SALARY_BANDS)
  },
  {
    id: "appeal_job_field",
    category: "appeal_subjective",
    prompt: "현재 일하는 분야를 가장 가깝게 선택해 주세요.",
    inputType: "single",
    privacyClass: "matching_private",
    metadata: { valueType: "job" },
    options: singleOptions(["IT/개발", "기획/마케팅", "교육/연구", "의료/보건", "금융/회계", "공공/법률", "예술/콘텐츠", "자영업", "기타"])
  },
  {
    id: "appeal_work_style",
    category: "appeal_subjective",
    prompt: "평소 일하는 방식은 무엇에 가깝나요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["정시와 균형을 중시", "프로젝트에 따라 몰입", "유연 근무 선호", "창업가형 또는 프리랜서형"])
  },
  {
    id: "appeal_weekend",
    category: "appeal_subjective",
    prompt: "이상적인 주말 데이트는 어떤 모습인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["카페와 산책", "전시와 공연", "맛집 탐방", "등산이나 운동", "집에서 편히 쉬기"])
  },
  {
    id: "appeal_hobbies",
    category: "appeal_subjective",
    prompt: "함께 나누고 싶은 취미를 골라 주세요.",
    inputType: "multi",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["운동", "독서", "영화", "음악", "요리", "여행", "게임", "반려동물", "사진"])
  },
  {
    id: "appeal_communication",
    category: "appeal_subjective",
    prompt: "연락 빈도는 어느 정도가 편한가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["자주 짧게 연락", "하루에 몇 번 깊게 연락", "바쁠 땐 여유 있게", "만날 때 집중하고 싶다"])
  },
  {
    id: "appeal_style",
    category: "appeal_subjective",
    prompt: "상대에게 자연스럽게 끌리는 매력은 무엇인가요?",
    inputType: "multi",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["다정함", "유머", "차분함", "자기관리", "호기심", "책임감", "표현력"])
  },
  {
    id: "appeal_pace",
    category: "appeal_subjective",
    prompt: "관계를 시작할 때 선호하는 속도는 무엇인가요?",
    inputType: "single",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" },
    options: singleOptions(["천천히 알아가기", "대화가 맞으면 빠르게 가까워지기", "친구처럼 편하게 시작하기", "서로 의도를 분명히 하고 시작하기"])
  },
  {
    id: "appeal_intro",
    category: "appeal_subjective",
    prompt: "나를 가장 잘 보여 주는 짧은 소개를 적어 주세요.",
    inputType: "text",
    privacyClass: "public",
    metadata: { valueType: "lifestyle" }
  }
] as const satisfies readonly Question[];

export type MbtiAnswerInput = {
  questionId: string;
  optionId: string;
};

export type MbtiScoreResult = Record<MbtiAxis, number>;

export declare function scoreMbti(answers: readonly MbtiAnswerInput[]): MbtiScoreResult;

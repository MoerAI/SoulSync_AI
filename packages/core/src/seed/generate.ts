import { upsertProfileEmbedding } from "../embeddings/index.js";
import { MockFriendli, type FriendliLike, type MockFriendliResponse } from "../friendli/index.js";
import { generatePersona, type PersonaPreview } from "../persona/index.js";
import type { Profile } from "../types/index.js";

export const DEFAULT_SYNTHETIC_COUNT = 50;
export const MAX_SYNTHETIC_COUNT = 200;
export const SYNTHETIC_FORBIDDEN_TOPICS = ["money requests", "off-platform contact", "meeting requests"] as const;

export type SyntheticUserRow = {
  id: string;
  primary_email: string;
  display_name: string;
  is_synthetic: true;
  birth_year: number;
  age_verified: true;
  updated_at: string;
};

export type SyntheticProfileRow = {
  id: string;
  app_user_id: string;
  gender: Gender;
  interested_in: string[];
  city: string;
  district: string;
  mbti: MbtiType;
  mbti_scores: Record<"EI" | "SN" | "TF" | "JP", number>;
  religion_type: ReligionType;
  religion_intensity: number;
  values: SyntheticValues;
  salary_band: string;
  visibility: "discoverable";
  is_synthetic: true;
  profile_text: string;
  updated_at: string;
};

export type SyntheticProfileAnswerRow = {
  id: string;
  app_user_id: string;
  question_id: string;
  answer: string | number | boolean | string[];
  privacy_class: PrivacyClass;
};

export type SyntheticSeedDatabase = {
  embeddingClient: Parameters<typeof upsertProfileEmbedding>[1];
  upsertAppUser(row: SyntheticUserRow): Promise<void>;
  upsertProfile(row: SyntheticProfileRow): Promise<void>;
  replaceProfileAnswers(appUserId: string, rows: SyntheticProfileAnswerRow[]): Promise<void>;
  updateProfilePersona(profileId: string, persona: Record<string, unknown>): Promise<void>;
};

export type SeedSyntheticOptions = {
  count?: number;
  friendli?: FriendliLike;
  now?: Date;
};

export type SeedSyntheticResult = {
  requestedCount: number;
  seededCount: number;
  userIds: string[];
  profileIds: string[];
};

type Gender = "female" | "male" | "nonbinary";
type ReligionType = (typeof RELIGION_TYPES)[number];
type MbtiType = (typeof MBTI_TYPES)[number];
type PrivacyClass = "public" | "matching_private" | "internal";
type Question = {
  id: string;
  category: "mbti" | "religion_values" | "appeal_subjective";
  privacyClass: PrivacyClass;
  metadata?: { axis?: "EI" | "SN" | "TF" | "JP" };
  options?: readonly { id: string; value: string | number; scoring?: { direction: "positive" | "negative" } }[];
};
type SyntheticValues = {
  religion: {
    type: ReligionType;
    intensity: number;
  };
  familyValues: string[];
  lifePriorities: string[];
  dealbreakers: string[];
};

const MBTI_TYPES = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"] as const;
const RELIGION_TYPES = ["무교", "기독교", "천주교", "불교", "이슬람교", "기타"] as const;
const SALARY_BANDS = ["3천만 미만", "3-5천만", "5-8천만", "8천만+", "비공개"] as const;
const LOCATION_OPTIONS = [
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
  "세종시",
] as const;
const GENDERS = ["female", "male", "nonbinary", "female", "male"] as const;
const INTERESTED_IN = [["male"], ["female"], ["female", "male"], ["any"], ["nonbinary", "female"]] as const;
const FAMILY_VALUES = ["서로의 경계 존중하기", "자주 교류하기", "필요할 때 책임 있게 돕기", "부부 중심의 독립성 지키기"];
const LIFE_PRIORITIES = ["신뢰", "성실함", "대화", "정서적 지지", "성장 의지", "경제 감각"];
const DEALBREAKERS = ["압박적인 만남 요구", "금전 요청", "무례한 대화", "연락처 강요", "가치관 비하"];
const INTERESTS = ["운동", "독서", "영화", "음악", "요리", "여행", "게임", "반려동물", "사진"];
// Synthetic seed photos must stay initials-only placeholders; no real-person likenesses or impersonation assets are generated here.
const AVATAR_POLICY = "Initials-only placeholder avatar; synthetic profile, not a real person.";
const WEEKENDS = ["카페와 산책", "전시와 공연", "맛집 탐방", "등산이나 운동", "집에서 편히 쉬기"];
const COMMUNICATION_STYLES = ["자주 짧게 연락", "하루에 몇 번 깊게 연락", "바쁠 땐 여유 있게", "만날 때 집중하고 싶다"];
const SYNTHETIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const QUESTIONS = [
  ...["EI", "SN", "TF", "JP"].flatMap((axis) =>
    Array.from({ length: 5 }, (_, index) => ({
      id: `mbti_${axis.toLowerCase()}_${String(index + 1).padStart(2, "0")}`,
      category: "mbti" as const,
      privacyClass: "public" as const,
      metadata: { axis: axis as "EI" | "SN" | "TF" | "JP" },
      options: [
        { id: "positive", value: positiveMbtiValue(axis), scoring: { direction: "positive" as const } },
        { id: "negative", value: negativeMbtiValue(axis), scoring: { direction: "negative" as const } },
      ],
    })),
  ),
  { id: "religion_type", category: "religion_values", privacyClass: "matching_private" },
  { id: "religion_intensity", category: "religion_values", privacyClass: "matching_private" },
  { id: "religion_partner_preference", category: "religion_values", privacyClass: "matching_private", options: optionList(["같은 배경이면 좋다", "다르더라도 존중하면 괜찮다", "크게 상관없다"]) },
  { id: "values_family", category: "religion_values", privacyClass: "matching_private" },
  { id: "values_marriage", category: "religion_values", privacyClass: "matching_private" },
  { id: "values_children", category: "religion_values", privacyClass: "matching_private", options: optionList(["원한다", "아직 모르겠다", "원하지 않는다", "상대와 충분히 상의하고 싶다"]) },
  { id: "values_finance", category: "religion_values", privacyClass: "matching_private" },
  { id: "values_conflict", category: "religion_values", privacyClass: "matching_private", options: optionList(["바로 대화하기", "시간을 두고 정리한 뒤 대화하기", "규칙을 정해 반복 갈등 줄이기", "감정을 충분히 확인한 뒤 해결하기"]) },
  { id: "values_service", category: "religion_values", privacyClass: "matching_private", options: optionList(["중요한 삶의 일부다", "기회가 있으면 참여하고 싶다", "개인의 선택이라고 본다", "현재는 우선순위가 낮다"]) },
  { id: "values_alcohol_smoking", category: "religion_values", privacyClass: "matching_private", options: optionList(["하지 않는 사람을 선호한다", "절제하면 괜찮다", "서로 합의하면 괜찮다", "크게 신경 쓰지 않는다"]) },
  { id: "appeal_location", category: "appeal_subjective", privacyClass: "matching_private" },
  { id: "appeal_salary_band", category: "appeal_subjective", privacyClass: "matching_private" },
  { id: "appeal_job_field", category: "appeal_subjective", privacyClass: "matching_private", options: optionList(["IT/개발", "기획/마케팅", "교육/연구", "의료/보건", "금융/회계", "공공/법률", "예술/콘텐츠", "자영업", "기타"]) },
  { id: "appeal_work_style", category: "appeal_subjective", privacyClass: "public", options: optionList(["정시와 균형을 중시", "프로젝트에 따라 몰입", "유연 근무 선호", "창업가형 또는 프리랜서형"]) },
  { id: "appeal_weekend", category: "appeal_subjective", privacyClass: "public", options: optionList(WEEKENDS) },
  { id: "appeal_hobbies", category: "appeal_subjective", privacyClass: "public" },
  { id: "appeal_communication", category: "appeal_subjective", privacyClass: "public", options: optionList(COMMUNICATION_STYLES) },
  { id: "appeal_style", category: "appeal_subjective", privacyClass: "public" },
  { id: "appeal_pace", category: "appeal_subjective", privacyClass: "public", options: optionList(["천천히 알아가기", "대화가 맞으면 빠르게 가까워지기", "친구처럼 편하게 시작하기", "서로 의도를 분명히 하고 시작하기"]) },
  { id: "appeal_intro", category: "appeal_subjective", privacyClass: "public" },
] satisfies Question[];

export const seedSyntheticCandidates = async (database: SyntheticSeedDatabase, options: SeedSyntheticOptions = {}): Promise<SeedSyntheticResult> => {
  const count = normalizeCount(options.count);
  const friendli = options.friendli ?? createMockSeedFriendli(count);
  const now = (options.now ?? new Date(SYNTHETIC_TIMESTAMP)).toISOString();
  const userIds: string[] = [];
  const profileIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const candidate = syntheticCandidate(index, now);

    await database.upsertAppUser(candidate.user);
    await database.upsertProfile(candidate.profile);
    await database.replaceProfileAnswers(candidate.user.id, candidate.answers);

    const persona = await generatePersona(profileForPersona(candidate), syntheticPersonaConsent(candidate.answers), friendli);
    await database.updateProfilePersona(candidate.profile.id, personaForStorage(persona));
    await upsertProfileEmbedding(candidate.profile.id, database.embeddingClient);

    userIds.push(candidate.user.id);
    profileIds.push(candidate.profile.id);
  }

  return { requestedCount: count, seededCount: count, userIds, profileIds };
};

export const normalizeCount = (count = DEFAULT_SYNTHETIC_COUNT): number => {
  if (!Number.isInteger(count) || count < DEFAULT_SYNTHETIC_COUNT || count > MAX_SYNTHETIC_COUNT) {
    throw new Error(`Synthetic seed count must be an integer from ${DEFAULT_SYNTHETIC_COUNT} to ${MAX_SYNTHETIC_COUNT}.`);
  }

  return count;
};

export const createMockSeedFriendli = (count = MAX_SYNTHETIC_COUNT): MockFriendli => {
  const responses: MockFriendliResponse[] = Array.from({ length: Math.max(count, 1) }, (_, index) => ({
    status: 200,
    body: modelPersona(index),
  }));

  return new MockFriendli(responses);
};

const syntheticCandidate = (index: number, now: string) => {
  const displayName = `Synthetic ${String(index + 1).padStart(3, "0")}`;
  const [city, district = ""] = LOCATION_OPTIONS[index % LOCATION_OPTIONS.length].split(" ");
  const mbti = MBTI_TYPES[index % MBTI_TYPES.length];
  const religionType = RELIGION_TYPES[index % RELIGION_TYPES.length];
  const religionIntensity = (index % 5) + 1;
  const gender = GENDERS[index % GENDERS.length];
  const interestedIn = [...INTERESTED_IN[index % INTERESTED_IN.length]];
  const values = syntheticValues(index, religionType, religionIntensity);
  const interests = pickMany(INTERESTS, index, 3);
  const profileText = [
    `${displayName} is a clearly labeled synthetic SoulSync candidate profile for cold-start matching tests.`,
    `MBTI ${mbti}, ${city} lifestyle, interests in ${interests.join(", ")}.`,
    AVATAR_POLICY,
  ].join(" ");
  const user: SyntheticUserRow = {
    id: seedUuid("90000001", index),
    primary_email: `synthetic-${String(index + 1).padStart(3, "0")}@seed.soulsync.invalid`,
    display_name: displayName,
    is_synthetic: true,
    birth_year: 1988 + (index % 12),
    age_verified: true,
    updated_at: now,
  };
  const profile: SyntheticProfileRow = {
    id: seedUuid("90000002", index),
    app_user_id: user.id,
    gender,
    interested_in: interestedIn,
    city,
    district,
    mbti,
    mbti_scores: mbtiScores(mbti),
    religion_type: religionType,
    religion_intensity: religionIntensity,
    values,
    salary_band: SALARY_BANDS[index % SALARY_BANDS.length],
    visibility: "discoverable",
    is_synthetic: true,
    profile_text: profileText,
    updated_at: now,
  };
  const answers = syntheticAnswers(index, user.id, { mbti, religionType, religionIntensity, values, interests, location: `${city} ${district}`, profileText });

  return { user, profile, answers };
};

const syntheticAnswers = (
  seedIndex: number,
  appUserId: string,
  source: { mbti: MbtiType; religionType: ReligionType; religionIntensity: number; values: SyntheticValues; interests: string[]; location: string; profileText: string },
): SyntheticProfileAnswerRow[] => {
  const selected = QUESTIONS.filter((question) => seedAnswerForQuestion(question, seedIndex, source) !== undefined);

  return selected.map((question, answerIndex) => ({
    id: answerUuid(seedIndex, answerIndex),
    app_user_id: appUserId,
    question_id: question.id,
    answer: seedAnswerForQuestion(question, seedIndex, source) as SyntheticProfileAnswerRow["answer"],
    privacy_class: question.privacyClass,
  }));
};

const seedAnswerForQuestion = (
  question: Question,
  seedIndex: number,
  source: { mbti: MbtiType; religionType: ReligionType; religionIntensity: number; values: SyntheticValues; interests: string[]; location: string; profileText: string },
): SyntheticProfileAnswerRow["answer"] | undefined => {
  if (question.category === "mbti") {
    return mbtiAnswerOption(source.mbti, question);
  }

  switch (question.id) {
    case "religion_type":
      return source.religionType;
    case "religion_intensity":
      return source.religionIntensity;
    case "religion_partner_preference":
      return optionValue(question, seedIndex);
    case "values_family":
      return source.values.familyValues[0];
    case "values_marriage":
      return source.values.lifePriorities.slice(0, 3);
    case "values_children":
    case "values_conflict":
    case "values_service":
    case "values_alcohol_smoking":
    case "appeal_job_field":
    case "appeal_work_style":
    case "appeal_weekend":
    case "appeal_communication":
    case "appeal_pace":
      return optionValue(question, seedIndex);
    case "values_finance":
      return "각자 관리하되 큰 지출은 상의";
    case "appeal_location":
      return source.location;
    case "appeal_salary_band":
      return "비공개";
    case "appeal_hobbies":
      return source.interests;
    case "appeal_style":
      return pickMany(["다정함", "유머", "차분함", "자기관리", "호기심", "책임감", "표현력"], seedIndex, 3);
    case "appeal_intro":
      return source.profileText;
    default:
      return undefined;
  }
};

const profileForPersona = (candidate: ReturnType<typeof syntheticCandidate>): Profile => ({
  id: candidate.profile.id,
  userId: candidate.user.id,
  visibility: candidate.profile.visibility,
  is_synthetic: candidate.profile.is_synthetic,
  location: {
    city: candidate.profile.city,
    district: candidate.profile.district,
  },
  salaryBand: candidate.profile.salary_band,
  answers: Object.fromEntries(candidate.answers.map((answer) => [answer.question_id, answer.answer])),
});

const syntheticPersonaConsent = (answers: SyntheticProfileAnswerRow[]) => ({
  persona: true,
  aiPersona: true,
  location: true,
  sensitive: true,
  religion: true,
  values: true,
  answers: Object.fromEntries(answers.map((answer) => [answer.question_id, true])),
});

const personaForStorage = (persona: PersonaPreview): Record<string, unknown> => ({
  ...persona,
  allowedTalkingPoints: persona.allowedTalkingPoints,
  forbiddenTopics: [...new Set([...persona.forbiddenTopics, ...SYNTHETIC_FORBIDDEN_TOPICS])],
});

const modelPersona = (index: number) => {
  const [city] = LOCATION_OPTIONS[index % LOCATION_OPTIONS.length].split(" ");

  return {
    id: seedUuid("90000002", index),
    displayName: `Synthetic ${String(index + 1).padStart(3, "0")}`,
    ageRange: ageRange(index),
    city,
    mbti: MBTI_TYPES[index % MBTI_TYPES.length],
    values: syntheticValues(index, RELIGION_TYPES[index % RELIGION_TYPES.length], (index % 5) + 1),
    interests: pickMany(INTERESTS, index, 3),
    communicationStyle: COMMUNICATION_STYLES[index % COMMUNICATION_STYLES.length],
    boundaries: ["No money requests", "No off-platform contact", "No meeting pressure"],
    allowedTalkingPoints: pickMany([...INTERESTS, ...WEEKENDS], index, 4),
    forbiddenTopics: SYNTHETIC_FORBIDDEN_TOPICS,
    is_synthetic: true,
  };
};

const syntheticValues = (index: number, religionType: ReligionType, religionIntensity: number): SyntheticValues => ({
  religion: { type: religionType, intensity: religionIntensity },
  familyValues: pickMany(FAMILY_VALUES, index, 2),
  lifePriorities: pickMany(LIFE_PRIORITIES, index, 3),
  dealbreakers: pickMany(DEALBREAKERS, index, 2),
});

const mbtiScores = (mbti: MbtiType): Record<"EI" | "SN" | "TF" | "JP", number> => ({
  EI: mbti[0] === "E" ? 0.8 : -0.8,
  SN: mbti[1] === "N" ? 0.8 : -0.8,
  TF: mbti[2] === "T" ? 0.8 : -0.8,
  JP: mbti[3] === "J" ? 0.8 : -0.8,
});

const mbtiAnswerOption = (mbti: MbtiType, question: Question): string => {
  const axis = question.metadata?.axis;
  const positive = axis === "EI" ? mbti[0] === "E" : axis === "SN" ? mbti[1] === "N" : axis === "TF" ? mbti[2] === "T" : mbti[3] === "J";
  const option = question.options?.find((candidate) => candidate.scoring?.direction === (positive ? "positive" : "negative"));

  return String(option?.value ?? option?.id ?? "");
};

const optionValue = (question: Question, index: number): string | number => {
  const options = question.options ?? [];
  const option = options[index % options.length];

  return option?.value ?? "";
};

const pickMany = <T>(values: readonly T[], index: number, count: number): T[] => Array.from({ length: count }, (_, offset) => values[(index + offset) % values.length] as T);
const ageRange = (index: number): string => (index % 3 === 0 ? "early 30s" : index % 3 === 1 ? "mid 30s" : "late 30s");
const seedUuid = (prefix: string, index: number): string => `${prefix}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const answerUuid = (seedIndex: number, answerIndex: number): string => `90000003-${String(seedIndex + 1).padStart(4, "0")}-4000-8000-${String(answerIndex + 1).padStart(12, "0")}`;
function optionList(values: readonly string[]) {
  return values.map((value, index) => ({ id: String(index + 1), value }));
}

function positiveMbtiValue(axis: string): string {
  return axis === "EI" ? "e" : axis === "SN" ? "n" : axis === "TF" ? "t" : "j";
}

function negativeMbtiValue(axis: string): string {
  return axis === "EI" ? "i" : axis === "SN" ? "s" : axis === "TF" ? "f" : "p";
}

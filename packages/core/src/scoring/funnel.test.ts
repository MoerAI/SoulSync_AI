import { describe, expect, test } from "vitest";

import type { MbtiType } from "../types";
import type { ReligionProfile, ValuesProfile } from "../types";
import { funnel, type FunnelCandidate, type FunnelUser } from "./funnel";

type Gender = "female" | "male" | "nonbinary";
type CandidateOverrides = Partial<Omit<FunnelCandidate, "persona">> & {
  gender?: Gender;
  interested_in?: readonly Gender[];
  mbti?: MbtiType;
  city?: string;
  district?: string;
  religion?: ReligionProfile;
  values?: Partial<ValuesProfile>;
  is_synthetic?: boolean;
};

const user: FunnelUser = {
  id: "user-1",
  gender: "female",
  interested_in: ["male"],
  mbti: "ENFP",
  religion: { type: "기독교", intensity: 3 },
  values: {
    familyValues: ["서로의 경계 존중하기"],
    lifePriorities: ["신뢰", "대화", "경제 감각"],
    dealbreakers: ["흡연"],
  },
  location: { city: "서울", district: "강남구" },
};

const candidate = (
  id: string,
  overrides: CandidateOverrides = {},
): FunnelCandidate => ({
  id,
  profileId: `profile-${id}`,
  persona: {
    id: `persona-${id}`,
    displayName: `Candidate ${id}`,
    mbti: overrides.mbti ?? "INTJ",
    values: {
      religion: overrides.religion ?? { type: "기독교", intensity: 3 },
      familyValues: ["서로의 경계 존중하기"],
      lifePriorities: ["신뢰", "대화", "경제 감각"],
      dealbreakers: ["음주"],
      ...(overrides.values ?? {}),
    },
    city: overrides.city ?? "서울",
    district: overrides.district ?? "강남구",
    interests: [],
    boundaries: [],
    is_synthetic: overrides.is_synthetic ?? false,
  },
  gender: overrides.gender ?? "male",
  interested_in: overrides.interested_in ?? ["female"],
  score: overrides.score,
});

describe("funnel", () => {
  test("returns exactly three orientation-matched candidates sorted by combined score from a rich mixed pool", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => {
      if (index % 5 === 0) {
        return candidate(`wrong-${index}`, { gender: "female", interested_in: ["male"], mbti: "INTJ" });
      }

      return candidate(`match-${index}`, {
        mbti: index % 3 === 0 ? "INFJ" : "INTJ",
        religion: { type: index % 4 === 0 ? "천주교" : "기독교", intensity: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5 },
        values: { lifePriorities: index % 2 === 0 ? ["신뢰", "대화"] : ["성장 의지"] },
        city: index % 6 === 0 ? "경기" : "서울",
        district: index % 6 === 0 ? "성남시" : "강남구",
      });
    });

    const result = funnel(user, candidates, { mbtiThreshold: 0.55 });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((item) => item.gender === "male" && item.interested_in.includes("female"))).toBe(true);
    expect(result.candidates.map((item) => item.score)).toEqual([...result.candidates.map((item) => item.score)].sort((a, b) => (b ?? 0) - (a ?? 0)));
    expect(result.fallbackTrace).toEqual([]);
  });

  test("relaxes sparse pools without manufacturing placeholder candidates", () => {
    const result = funnel(
      user,
      [candidate("strict-only"), candidate("needs-relax", { mbti: "ESTJ", city: "경기", district: "성남시", religion: { type: "불교", intensity: 5 } })],
      { mbtiThreshold: 0.9 },
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.fallbackTrace).toContain("mbti_relaxed");
    expect(result.candidates.some((item) => item.id === "needs-relax")).toBe(true);
    expect(result.candidates.every((item) => !item.id.startsWith("synthetic-fallback-"))).toBe(true);
  });

  test("ranks injected synthetic fallback candidates from the supplied pool", () => {
    const candidates = [
      candidate("strict-only"),
      candidate("synthetic-1", { city: "경기", district: "성남시", is_synthetic: true }),
      candidate("synthetic-2", { city: "인천", district: "연수구", is_synthetic: true }),
    ];

    const result = funnel(user, candidates, { mbtiThreshold: 0.9 });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.filter((item) => item.persona.is_synthetic)).toHaveLength(2);
    expect(result.candidates.every((item) => candidates.some((input) => input.id === item.id))).toBe(true);
    expect(result.candidates.every((item) => !item.id.startsWith("synthetic-fallback-") && !item.profileId.startsWith("profile-synthetic-fallback-"))).toBe(true);
  });

  test("never returns wrong-orientation candidates, even as fallback pressure increases", () => {
    const result = funnel(user, [candidate("wrong", { gender: "female", interested_in: ["male"] })], { mbtiThreshold: 0.95 });

    expect(result.candidates).toHaveLength(0);
    expect(result.candidates.every((item) => item.id !== "wrong")).toBe(true);
  });
});

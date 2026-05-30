import { describe, expect, test } from "vitest";

import { valuesOverlap } from "./values";

const baseValues = {
  familyValues: ["서로의 경계 존중하기", "부부 중심의 독립성 지키기"],
  lifePriorities: ["신뢰", "대화", "경제 감각"],
  dealbreakers: ["흡연", "과소비"],
};

describe("valuesOverlap", () => {
  test("scores identical structured values as a perfect overlap", () => {
    expect(valuesOverlap(baseValues, baseValues)).toBe(1);
  });

  test("uses optional free-text similarity when supplied", () => {
    const score = valuesOverlap(
      { ...baseValues, freeText: "주말에는 가족과 대화하는 시간을 중요하게 생각해요" },
      { ...baseValues, freeText: "가족과 자주 대화하며 신뢰를 쌓고 싶어요" },
      { textSimilarity: () => 0.8 },
    );

    expect(score).toBeGreaterThan(0.9);
  });

  test("returns deterministic bounded scores with keyword fallback", () => {
    const a = { familyValues: ["자주 교류하기"], lifePriorities: ["성장 의지"], dealbreakers: ["도박"] };
    const b = { familyValues: ["필요할 때 책임 있게 돕기"], lifePriorities: ["정서적 지지"], dealbreakers: ["흡연"] };
    const first = valuesOverlap(a, b);
    const second = valuesOverlap(a, b);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
  });
});

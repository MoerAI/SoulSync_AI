import { describe, expect, test } from "vitest";

import {
  LOCATION_OPTIONS,
  MBTI_AXES,
  QUESTIONS,
  RELIGION_INTENSITY_SCALE,
  SALARY_BANDS,
  type MbtiAxis
} from "../questions";

const mbtiQuestions = QUESTIONS.filter((question) => question.category === "mbti");
const religionQuestions = QUESTIONS.filter((question) => question.category === "religion_values");
const appealQuestions = QUESTIONS.filter((question) => question.category === "appeal_subjective");

describe("SoulSync question framework", () => {
  test("contains exactly 40 questions across the required groups", () => {
    expect(QUESTIONS).toHaveLength(40);
    expect(mbtiQuestions).toHaveLength(20);
    expect(religionQuestions).toHaveLength(10);
    expect(appealQuestions).toHaveLength(10);
  });

  test("has five MBTI questions per axis", () => {
    const counts = MBTI_AXES.reduce<Record<MbtiAxis, number>>(
      (accumulator, axis) => ({
        ...accumulator,
        [axis]: mbtiQuestions.filter((question) => question.metadata?.axis === axis).length
      }),
      { EI: 0, SN: 0, TF: 0, JP: 0 }
    );

    expect(counts).toEqual({ EI: 5, SN: 5, TF: 5, JP: 5 });
  });

  test("adds MBTI scoring metadata to every MBTI option", () => {
    for (const question of mbtiQuestions) {
      expect(question.options?.length).toBeGreaterThan(0);

      for (const option of question.options ?? []) {
        expect(option.scoring).toEqual({
          axis: question.metadata?.axis,
          direction: expect.stringMatching(/^(positive|negative)$/),
          weight: expect.any(Number)
        });
        expect(option.scoring?.weight).toBeGreaterThan(0);
      }
    }
  });

  test("defines religion intensity as five anchored Korean levels", () => {
    expect(RELIGION_INTENSITY_SCALE).toHaveLength(5);
    expect(RELIGION_INTENSITY_SCALE[0]).toEqual({ value: 1, label: "명목/비실천" });
    expect(RELIGION_INTENSITY_SCALE[4]).toEqual({ value: 5, label: "독실/적극실천" });
  });

  test("keeps salary and religion intensity matching private", () => {
    expect(QUESTIONS.find((question) => question.id === "appeal_salary_band")?.privacyClass).toBe("matching_private");
    expect(QUESTIONS.find((question) => question.id === "religion_intensity")?.privacyClass).toBe("matching_private");
  });

  test("exports salary bands and coarse location choices", () => {
    expect(SALARY_BANDS).toEqual(["3천만 미만", "3-5천만", "5-8천만", "8천만+", "비공개"]);
    expect(LOCATION_OPTIONS).toContain("서울 강남구");
    expect(LOCATION_OPTIONS).toContain("경기 성남시");
    expect(LOCATION_OPTIONS).toContain("세종시");
  });

  test("does not ask for precise address or coordinates", () => {
    const serialized = JSON.stringify(QUESTIONS);

    expect(serialized).not.toMatch(/home_?address|workplace_?address|상세주소|도로명|위도|경도|lat|lng/i);
  });
});

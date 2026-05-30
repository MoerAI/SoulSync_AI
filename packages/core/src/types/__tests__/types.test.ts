import { describe, expect, test } from "vitest";
import { z } from "zod";

import { JudgeScoreSchema, PersonaSpecSchema } from "../index";

const validJudgeScore = {
  overall: 78,
  subscores: {
    flow: 20,
    coherence: 16,
    mutual_curiosity: 17,
    values_alignment: 16,
    friction_risk: 6,
  },
  confidence: 0.82,
  flags: ["warm_opening"],
  summaryKo: "대화 흐름이 자연스럽고 상호 호기심이 확인됩니다.",
  rationale: "Both candidates asked follow-up questions and shared compatible values.",
  judgePromptVersion: "judge-v1",
  judgeSchemaVersion: "judge-score-v1",
};

describe("JudgeScoreSchema", () => {
  test("parses a valid fixture", () => {
    const parsed = JudgeScoreSchema.parse(validJudgeScore);

    expect(parsed.overall).toBe(78);
  });

  test("rejects an invalid overall score", () => {
    expect(() => JudgeScoreSchema.parse({ ...validJudgeScore, overall: 130 })).toThrow(z.ZodError);
  });
});

describe("PersonaSpecSchema", () => {
  test("does not expose salary or exact-location keys", () => {
    const keys = Object.keys(PersonaSpecSchema.shape);

    expect(keys).not.toContain("salary");
    expect(keys).not.toContain("salaryBand");
    expect(keys).not.toContain("exactLocation");
    expect(keys).not.toContain("homeAddress");
  });
});

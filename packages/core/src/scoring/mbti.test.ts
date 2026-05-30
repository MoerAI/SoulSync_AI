import { describe, expect, test } from "vitest";

import { QUESTIONS } from "../../../../content/questions";
import {
  MBTI_COMPAT_FIXTURES,
  MBTI_DISCLAIMER,
  deriveMbti,
  mbtiCompatibility,
  passesMbtiFilter,
  relaxThreshold,
  type MbtiScoredAnswer,
} from "./mbti";

const mbtiQuestions = QUESTIONS.filter((question) => question.category === "mbti");

const findScoredAnswer = (questionId: string, direction: "positive" | "negative"): MbtiScoredAnswer => {
  const question = mbtiQuestions.find((candidate) => candidate.id === questionId);
  const scoring = question?.options?.find((option) => option.scoring?.direction === direction)?.scoring;

  if (!scoring) {
    throw new Error(`Missing ${direction} MBTI scoring for ${questionId}`);
  }

  return scoring;
};

const answersByAxisDirection = (directions: Record<"EI" | "SN" | "TF" | "JP", "positive" | "negative">) =>
  mbtiQuestions.map((question) => findScoredAnswer(question.id, directions[question.metadata?.axis ?? "EI"]));

const balancedThinkingFeelingAnswers = () =>
  mbtiQuestions.map((question) => {
    if (question.metadata?.axis !== "TF") {
      return findScoredAnswer(question.id, "positive");
    }

    if (question.id === "mbti_tf_01" || question.id === "mbti_tf_02") {
      return findScoredAnswer(question.id, "positive");
    }

    return findScoredAnswer(question.id, "negative");
  });

describe("deriveMbti", () => {
  test("derives identical results from identical answers", () => {
    const answers = answersByAxisDirection({ EI: "positive", SN: "positive", TF: "negative", JP: "negative" });

    expect(deriveMbti(answers)).toEqual(deriveMbti(answers));
  });

  test("derives a high-confidence E result from all extroversion answers", () => {
    const result = deriveMbti(answersByAxisDirection({ EI: "positive", SN: "positive", TF: "positive", JP: "positive" }));

    expect(result.scores.EI).toBeGreaterThan(0.5);
    expect(result.type[0]).toBe("E");
    expect(result.confidence.EI).toBeGreaterThan(0.5);
  });

  test("keeps balanced T/F deterministic with low confidence", () => {
    const result = deriveMbti(balancedThinkingFeelingAnswers());

    expect(Math.abs(result.scores.TF)).toBeLessThan(0.15);
    expect(result.confidence.TF).toBeLessThan(0.15);
    expect(result.type[2]).toBe("T");
  });
});

describe("mbtiCompatibility", () => {
  test("returns continuous scores in range without making identical types a perfect match", () => {
    const score = mbtiCompatibility("ENFP", "ENFP");

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeLessThan(1);
  });

  test("ranks complementary anchors above clash anchors", () => {
    const complementary = mbtiCompatibility("ENFP", "INTJ");
    const similarComplementary = mbtiCompatibility("INFJ", "ENFP");
    const clash = mbtiCompatibility("ESTJ", "INFP");

    expect(complementary).toBeGreaterThan(similarComplementary);
    expect(similarComplementary).toBeGreaterThan(clash);
  });

  test("keeps frozen compatibility fixture anchors aligned with the formula", () => {
    for (const fixture of MBTI_COMPAT_FIXTURES) {
      expect(mbtiCompatibility(fixture.a, fixture.b)).toBe(fixture.score);
    }
  });

  test("filters by soft threshold and relaxes thresholds to a documented floor", () => {
    const score = mbtiCompatibility("ENFP", "INTJ");

    expect(passesMbtiFilter("ENFP", "INTJ", score)).toBe(true);
    expect(passesMbtiFilter("ENFP", "INTJ", score + 0.01)).toBe(false);
    expect(relaxThreshold(0.76)).toBe(0.75);
    expect(relaxThreshold(0.35)).toBe(0.35);
  });

  test("labels MBTI scoring as an entertainment heuristic", () => {
    expect(MBTI_DISCLAIMER).toContain("entertainment");
    expect(MBTI_DISCLAIMER).toContain("not psychometric");
  });
});

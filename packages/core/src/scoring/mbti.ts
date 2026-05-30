import type { MbtiAxis, MbtiAxisScores, MbtiType } from "../types/mbti";

export type MbtiScoredAnswer = {
  axis: MbtiAxis;
  direction: "positive" | "negative";
  weight: number;
};

export type MbtiDerivation = {
  scores: MbtiAxisScores;
  type: MbtiType;
  confidence: MbtiAxisScores;
};

export type MbtiCompatibilityFixture = {
  label: string;
  a: MbtiType;
  b: MbtiType;
  score: number;
};

const AXES = ["EI", "SN", "TF", "JP"] as const satisfies readonly MbtiAxis[];
const POSITIVE_LETTERS = { EI: "E", SN: "N", TF: "T", JP: "J" } as const;
const NEGATIVE_LETTERS = { EI: "I", SN: "S", TF: "F", JP: "P" } as const;
const RELAXATION_FLOOR = 0.35;
const RELAXATION_LADDER = [0.9, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, RELAXATION_FLOOR] as const;

export const MBTI_DISCLAIMER =
  "SoulSync MBTI scoring is an entertainment compatibility heuristic for conversation prompts, not psychometric truth or a validated personality assessment.";

export const MBTI_COMPAT_FIXTURES = [
  { label: "ENFPxINTJ complementary", a: "ENFP", b: "INTJ", score: 0.7375 },
  { label: "INFJxENFP similar-complementary", a: "INFJ", b: "ENFP", score: 0.625 },
  { label: "ESTJxINFP clash", a: "ESTJ", b: "INFP", score: 0.45 },
] as const satisfies readonly MbtiCompatibilityFixture[];

export const deriveMbti = (answers: readonly MbtiScoredAnswer[]): MbtiDerivation => {
  const totals = emptyAxisScores();
  const weights = emptyAxisScores();

  for (const answer of answers) {
    const signedWeight = answer.direction === "positive" ? answer.weight : -answer.weight;
    totals[answer.axis] += signedWeight;
    weights[answer.axis] += Math.abs(answer.weight);
  }

  const scores = axisMap((axis) => clamp(weights[axis] === 0 ? 0 : totals[axis] / weights[axis]));

  return {
    scores,
    type: mbtiTypeFromScores(scores),
    confidence: axisMap((axis) => Math.abs(scores[axis])),
  };
};

export const mbtiCompatibility = (a: MbtiType | MbtiAxisScores, b: MbtiType | MbtiAxisScores): number => {
  const left = typeof a === "string" ? scoresFromType(a) : a;
  const right = typeof b === "string" ? scoresFromType(b) : b;
  const complementarity = average([axisSimilarity(left.SN, right.SN), axisOpposition(left.TF, right.TF)]);
  const similarity = average(AXES.map((axis) => axisSimilarity(left[axis], right[axis])));
  const energyFit = average([axisOpposition(left.EI, right.EI), axisOpposition(left.JP, right.JP)]);

  return clamp(0.4 * complementarity + 0.35 * similarity + 0.25 * energyFit);
};

export const passesMbtiFilter = (a: MbtiType | MbtiAxisScores, b: MbtiType | MbtiAxisScores, threshold: number): boolean =>
  mbtiCompatibility(a, b) >= threshold;

export const relaxThreshold = (current: number): number => {
  if (current <= RELAXATION_FLOOR) {
    return RELAXATION_FLOOR;
  }

  return RELAXATION_LADDER.find((threshold) => threshold < current) ?? RELAXATION_FLOOR;
};

const mbtiTypeFromScores = (scores: MbtiAxisScores): MbtiType =>
  `${scores.EI >= 0 ? POSITIVE_LETTERS.EI : NEGATIVE_LETTERS.EI}${scores.SN >= 0 ? POSITIVE_LETTERS.SN : NEGATIVE_LETTERS.SN}${
    scores.TF >= 0 ? POSITIVE_LETTERS.TF : NEGATIVE_LETTERS.TF
  }${scores.JP >= 0 ? POSITIVE_LETTERS.JP : NEGATIVE_LETTERS.JP}` as MbtiType;

const scoresFromType = (type: MbtiType): MbtiAxisScores => ({
  EI: type[0] === POSITIVE_LETTERS.EI ? 1 : -1,
  SN: type[1] === POSITIVE_LETTERS.SN ? 1 : -1,
  TF: type[2] === POSITIVE_LETTERS.TF ? 1 : -1,
  JP: type[3] === POSITIVE_LETTERS.JP ? 1 : -1,
});

const axisSimilarity = (a: number, b: number) => clamp(1 - Math.abs(a - b) / 2);

const axisOpposition = (a: number, b: number) => clamp(Math.abs(a - b) / 2);

const emptyAxisScores = (): MbtiAxisScores => ({ EI: 0, SN: 0, TF: 0, JP: 0 });

const axisMap = (mapper: (axis: MbtiAxis) => number): MbtiAxisScores => ({
  EI: mapper("EI"),
  SN: mapper("SN"),
  TF: mapper("TF"),
  JP: mapper("JP"),
});

const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

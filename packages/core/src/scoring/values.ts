import type { ValuesProfile } from "../types";

export type ValuesLike = Partial<ValuesProfile> &
  Record<string, unknown> & {
    freeText?: string;
    text?: string;
    intro?: string;
    appeal_intro?: string;
  };

export type ValuesOverlapOptions = {
  textSimilarity?: (a: string, b: string) => number;
};

const STRUCTURED_FIELDS = [
  "familyValues",
  "lifePriorities",
  "dealbreakers",
  "values_family",
  "values_marriage",
  "values_children",
  "values_finance",
  "values_conflict",
  "values_service",
  "values_alcohol_smoking",
] as const;

const TEXT_FIELDS = ["freeText", "text", "intro", "appeal_intro"] as const;

export const valuesOverlap = (a: ValuesLike, b: ValuesLike, opts: ValuesOverlapOptions = {}): number => {
  const structuredScores = STRUCTURED_FIELDS.map((field) => fieldOverlap(a[field], b[field])).filter((score) => score !== undefined);
  const textScore = textOverlap(textFrom(a), textFrom(b), opts.textSimilarity);
  const scores = textScore === undefined ? structuredScores : [...structuredScores, textScore];

  if (scores.length === 0) {
    return 0.5;
  }

  return clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length);
};

const fieldOverlap = (a: unknown, b: unknown): number | undefined => {
  const left = tokensFrom(a);
  const right = tokensFrom(b);

  if (left.length === 0 && right.length === 0) {
    return undefined;
  }

  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  return jaccard(left, right);
};

const textOverlap = (a: string, b: string, similarity?: (a: string, b: string) => number): number | undefined => {
  if (!a && !b) {
    return undefined;
  }

  if (!a || !b) {
    return 0;
  }

  if (similarity) {
    return clamp(similarity(a, b));
  }

  return jaccard(tokenizeText(a), tokenizeText(b));
};

const tokensFrom = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => tokensFrom(item));
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [normalizeToken(String(value))].filter(Boolean);
  }

  return [];
};

const textFrom = (values: ValuesLike): string => TEXT_FIELDS.map((field) => values[field]).filter((value): value is string => typeof value === "string").join(" ");

const tokenizeText = (value: string): string[] => value.split(/[^\p{L}\p{N}]+/u).map(normalizeToken).filter((token) => token.length >= 2);

const normalizeToken = (value: string): string => value.trim().toLocaleLowerCase("ko-KR");

const jaccard = (a: readonly string[], b: readonly string[]): number => {
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;

  return union === 0 ? 0 : intersection / union;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

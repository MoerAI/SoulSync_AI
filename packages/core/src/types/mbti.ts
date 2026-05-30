import { z } from "zod";

export const MbtiAxisSchema = z.enum(["EI", "SN", "TF", "JP"]);
export type MbtiAxis = z.infer<typeof MbtiAxisSchema>;

export const MbtiAxisScoresSchema = z.object({
  EI: z.number(),
  SN: z.number(),
  TF: z.number(),
  JP: z.number(),
});
export type MbtiAxisScores = z.infer<typeof MbtiAxisScoresSchema>;

export const MbtiTypeSchema = z.enum([
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
]);
export type MbtiType = z.infer<typeof MbtiTypeSchema>;

export type scoreMbti = (scores: MbtiAxisScores) => MbtiType;

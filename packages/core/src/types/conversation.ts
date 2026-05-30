import { z } from "zod";

export const ConversationTurnSchema = z.object({
  speakerId: z.string(),
  content: z.string(),
  turnIndex: z.number().int().nonnegative(),
  createdAt: z.string().optional(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const TranscriptSchema = z.object({
  id: z.string(),
  candidateAId: z.string(),
  candidateBId: z.string(),
  turns: z.array(ConversationTurnSchema),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

export const JudgeSubscoresSchema = z.object({
  flow: z.number().min(0).max(25),
  coherence: z.number().min(0).max(20),
  mutual_curiosity: z.number().min(0).max(20),
  values_alignment: z.number().min(0).max(20),
  friction_risk: z.number().min(0).max(15),
});
export type JudgeSubscores = z.infer<typeof JudgeSubscoresSchema>;

export const JudgeScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  subscores: JudgeSubscoresSchema,
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()),
  summaryKo: z.string(),
  rationale: z.string(),
  judgePromptVersion: z.string(),
  judgeSchemaVersion: z.string(),
});
export type JudgeScore = z.infer<typeof JudgeScoreSchema>;

export const RecommendationSchema = z.object({
  candidateId: z.string(),
  judgeScore: JudgeScoreSchema,
  rank: z.number().int().positive(),
  recommended: z.boolean(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

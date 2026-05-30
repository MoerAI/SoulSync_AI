import { z } from "zod";

export const MatchJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type MatchJobStatus = z.infer<typeof MatchJobStatusSchema>;

export const ActorSchema = z.object({
  source: z.enum(["mcp", "mobile", "cron", "worker"]),
  id: z.string().optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const ConsentSchema = z.object({
  userId: z.string(),
  purpose: z.string(),
  granted: z.boolean(),
  grantedAt: z.string().optional(),
});
export type Consent = z.infer<typeof ConsentSchema>;

export const MatchJobSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  status: MatchJobStatusSchema,
  actor: ActorSchema,
  consent: ConsentSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
});
export type MatchJob = z.infer<typeof MatchJobSchema>;

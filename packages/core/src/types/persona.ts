import { z } from "zod";

import { MbtiTypeSchema } from "./mbti";
import { ValuesProfileSchema } from "./religion";

export const PersonaSpecSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    ageRange: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    mbti: MbtiTypeSchema.optional(),
    values: ValuesProfileSchema.optional(),
    interests: z.array(z.string()).default([]),
    communicationStyle: z.string().optional(),
    boundaries: z.array(z.string()).default([]),
    is_synthetic: z.boolean(),
  })
  .strict();
export type PersonaSpec = z.infer<typeof PersonaSpecSchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  persona: PersonaSpecSchema,
  score: z.number().min(0).max(100).optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

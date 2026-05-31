import { z } from "zod";

export const CardGenInputSchema = z
  .object({
    displayName: z.string().min(1),
    ageRange: z.string().optional(),
    city: z.string().optional(),
    mbti: z.string().optional(),
    interests: z.array(z.string()).default([]),
    values: z.array(z.string()).optional(),
    is_synthetic: z.boolean(),
    photoSlots: z.array(z.string()).default([]),
  })
  .strict();
export type CardGenInput = z.infer<typeof CardGenInputSchema>;

export const CardArtifactSchema = z
  .object({
    version: z.string(),
    generatorVersion: z.string(),
    html: z.string(),
    css: z.string(),
    placeholders: z.array(z.string()),
    is_synthetic: z.boolean(),
  })
  .strict();
export type CardArtifact = z.infer<typeof CardArtifactSchema>;

export const CardVersionKeySchema = z
  .object({
    profileVersion: z.string(),
    photoFingerprint: z.string(),
    style: z.string(),
    generatorVersion: z.string(),
  })
  .strict();
export type CardVersionKey = z.infer<typeof CardVersionKeySchema>;

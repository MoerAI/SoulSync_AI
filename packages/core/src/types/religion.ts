import { z } from "zod";

export const ReligionTypeSchema = z.enum(["무교", "기독교", "천주교", "불교", "이슬람교", "기타"]);
export type ReligionType = z.infer<typeof ReligionTypeSchema>;

export const ReligionProfileSchema = z.object({
  type: ReligionTypeSchema,
  intensity: z.number().int().min(1).max(5),
});
export type ReligionProfile = z.infer<typeof ReligionProfileSchema>;

export const ValuesProfileSchema = z.object({
  religion: ReligionProfileSchema.optional(),
  familyValues: z.array(z.string()).default([]),
  lifePriorities: z.array(z.string()).default([]),
  dealbreakers: z.array(z.string()).default([]),
});
export type ValuesProfile = z.infer<typeof ValuesProfileSchema>;

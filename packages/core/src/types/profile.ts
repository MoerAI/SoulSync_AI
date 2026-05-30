import { z } from "zod";

export const ProfileAnswersSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]));
export type ProfileAnswers = z.infer<typeof ProfileAnswersSchema>;

export const ProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  visibility: z.enum(["private", "discoverable"]),
  is_synthetic: z.boolean(),
  location: z.object({
    city: z.string(),
    district: z.string(),
  }),
  salaryBand: z.string().optional(),
  answers: ProfileAnswersSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

import { z } from "zod";

export const PrivacyClassSchema = z.enum(["public", "matching_private", "internal"]);
export type PrivacyClass = z.infer<typeof PrivacyClassSchema>;

export const ExternalIdentitySchema = z.object({
  provider: z.string(),
  providerUserId: z.string(),
  privacyClass: PrivacyClassSchema,
});
export type ExternalIdentity = z.infer<typeof ExternalIdentitySchema>;

export const AppUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.email().optional(),
  identities: z.array(ExternalIdentitySchema),
  createdAt: z.string(),
});
export type AppUser = z.infer<typeof AppUserSchema>;

import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const reportProfileInput = {
  profileId: z.string().min(1),
  reason: z.string().min(1).max(500),
  idempotencyKey: z.string().min(1).optional(),
};

export async function reportProfile(input: { profileId: string; reason: string; idempotencyKey?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const { data, error } = await getServiceSupabase().from("reports").insert({ reporter_id: actor.appUserId, reported_id: input.profileId, reason: input.reason }).select("id").single<{ id: string }>();

  if (error || !data) {
    rowError("Unable to report profile");
  }

  return ok({ reportId: data.id, reported: true }, "Profile reported.");
}

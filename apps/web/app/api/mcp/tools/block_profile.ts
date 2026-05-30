import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const blockProfileInput = {
  profileId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
};

export async function blockProfile(input: { profileId: string; idempotencyKey?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const { data, error } = await getServiceSupabase()
    .from("blocks")
    .upsert({ blocker_id: actor.appUserId, blocked_id: input.profileId }, { onConflict: "blocker_id,blocked_id" })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    rowError("Unable to block profile");
  }

  return ok({ blockId: data.id, blockedProfileId: input.profileId }, "Profile blocked.");
}

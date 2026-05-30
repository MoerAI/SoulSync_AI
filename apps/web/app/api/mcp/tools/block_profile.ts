import { blockProfile as coreBlockProfile } from "@soulsync/core/src/safety/enforcement";
import { serializeBlock } from "@soulsync/core/src/serializers";
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
  const result = await coreBlockProfile({ blockerId: actor.appUserId, blockedId: input.profileId }, getServiceSupabase() as never).catch(() => null);

  if (!result) {
    rowError("Unable to block profile");
  }

  return ok(serializeBlock({ blockId: result.id, blockedProfileId: input.profileId }), "Profile blocked.");
}

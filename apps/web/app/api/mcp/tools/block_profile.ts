import { blockProfile as coreBlockProfile } from "@soulsync/core/src/safety/enforcement";
import { serializeBlock } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, asEnforcementClient, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const blockProfileInput = {
  candidateId: z.string().min(1),
};

export async function blockProfile(input: { candidateId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await coreBlockProfile({ blockerId: actor.appUserId, blockedId: input.candidateId }, asEnforcementClient(getServiceSupabase())).catch(() => null);

  if (!result) {
    rowError("Unable to block profile");
  }

  return ok(serializeBlock({ blockId: result.id, blockedProfileId: input.candidateId }), "Profile blocked.");
}

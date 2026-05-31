import { blockProfile as blockProfileService } from "@soulsync/core/src/services/safetyService";
import { serializeBlock } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const blockProfileInput = {
  candidateId: z.string().min(1),
};

export async function blockProfile(input: { candidateId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await blockProfileService({ profileId: input.candidateId }, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!result) {
    rowError("Unable to block profile");
  }

  return ok(serializeBlock(result), "Profile blocked.");
}

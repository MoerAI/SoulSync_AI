import { saveProfileStep as saveProfileStepService } from "@soulsync/core/src/services/profileService";
import { serializeProfileStep } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveProfileStepInput = {
  step: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
};

export async function saveProfileStep(input: { step: string; data: Record<string, unknown> }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await saveProfileStepService(input, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!result) {
    rowError("Unable to save profile step");
  }

  return ok(serializeProfileStep(result), "Profile step saved.");
}

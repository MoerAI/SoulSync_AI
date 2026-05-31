import { saveRecommendation as saveRecommendationService } from "@soulsync/core/src/services/recommendationService";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveRecommendationInput = {
  recommendationId: z.string().min(1),
};

export async function saveRecommendation(input: { recommendationId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await saveRecommendationService(input, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!result) {
    rowError("Unable to save recommendation");
  }

  return ok(result, "Recommendation saved.");
}

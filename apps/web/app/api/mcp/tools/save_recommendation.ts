import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveRecommendationInput = {
  recommendationId: z.string().min(1),
};

type RecommendationInterestRow = {
  id: string;
  subscores: unknown;
};

export async function saveRecommendation(input: { recommendationId: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("recommendations").select("id, subscores").eq("id", input.recommendationId).eq("app_user_id", actor.appUserId).single<RecommendationInterestRow>();

  if (error || !data) {
    rowError("Unable to save recommendation");
  }

  const subscores = data.subscores && typeof data.subscores === "object" && !Array.isArray(data.subscores) ? data.subscores : {};
  const update = await supabase.from("recommendations").update({ subscores: { ...subscores, user_interest_saved: true } }).eq("id", input.recommendationId).eq("app_user_id", actor.appUserId);
  if (update.error) {
    rowError("Unable to save recommendation");
  }

  return ok({ recommendationId: input.recommendationId, saved: true }, "Recommendation saved.");
}

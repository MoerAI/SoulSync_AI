import { listRecommendations as listRecommendationsService, recommendationMetaFromRows, type RecommendationMeta, type RecommendationRow } from "@soulsync/core/src/services/recommendationService";
import { serializeRecommendations } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const listRecommendationsInput = {};
export type { RecommendationMeta, RecommendationRow };

export function toRecommendationResponse(rows: RecommendationRow[], meta: RecommendationMeta[] = recommendationMetaFromRows(rows)): ToolResponse {
  const structuredContent = serializeRecommendations(rows);

  return ok(structuredContent, `${structuredContent.count} recommendations found.`, {
    recommendations: meta,
  });
}

export async function listRecommendations(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  const result = await listRecommendationsService({ limit: 10 }, { client: getServiceSupabase(), actor });

  return toRecommendationResponse(result.rows, result.meta);
}

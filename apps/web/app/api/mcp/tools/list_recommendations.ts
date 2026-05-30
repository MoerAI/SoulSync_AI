import { serializeRecommendation, serializeRecommendations } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const listRecommendationsInput = {
  jobId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(10).optional(),
};

export type RecommendationRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  rank: number | null;
  overall: number | string | null;
  summary_ko: string | null;
  is_synthetic: boolean | null;
  subscores?: unknown;
};

export function toRecommendationResponse(rows: RecommendationRow[]): ToolResponse {
  const structuredContent = serializeRecommendations(rows);

  return ok(structuredContent, `${structuredContent.count} recommendations found.`, {
    recommendations: rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      rank: row.rank ?? 0,
      subscores: serializeRecommendation(row).subscores,
    })),
  });
}

export async function listRecommendations(input: { jobId?: string; limit?: number } = {}): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  let query = getServiceSupabase()
    .from("recommendations")
    .select("id, job_id, candidate_id, rank, overall, summary_ko, is_synthetic, subscores")
    .eq("app_user_id", actor.appUserId)
    .order("rank", { ascending: true })
    .limit(input.limit ?? 3);

  if (input.jobId) {
    query = query.eq("job_id", input.jobId);
  }

  const { data, error } = await query.returns<RecommendationRow[]>();

  if (error) {
    throw new Error("Unable to list recommendations");
  }

  return toRecommendationResponse(data ?? []);
}

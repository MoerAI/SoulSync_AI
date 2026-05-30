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
  const recommendations = rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    candidateId: row.candidate_id,
    rank: row.rank ?? 0,
    overall: typeof row.overall === "number" ? row.overall : Number(row.overall ?? 0),
    summary: row.summary_ko ?? "",
    is_synthetic: Boolean(row.is_synthetic),
  }));

  return ok({ count: recommendations.length, recommendations }, `${recommendations.length} recommendations found.`, {
    recommendations: rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      rank: row.rank ?? 0,
      subscores: row.subscores ?? null,
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

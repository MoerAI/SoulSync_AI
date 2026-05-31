import { displayablePhotos } from "@soulsync/core/src/safety/moderation";
import { serializeRecommendation, serializeRecommendationSubscores } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const listRecommendationsInput = {};

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

type PhotoRow = {
  id: string;
  app_user_id: string;
  bucket: string;
  path: string;
  moderation_status: string | null;
  is_primary: boolean | null;
};

type RecommendationMeta = {
  id: string;
  candidateId: string;
  rank: number;
  subscores: Record<string, number>;
  highlights: string[];
  photoUrl?: string;
};

export function toRecommendationResponse(rows: RecommendationRow[], meta: RecommendationMeta[] = rows.map((row) => ({ id: row.id, candidateId: row.candidate_id, rank: row.rank ?? 0, subscores: serializeRecommendationSubscores(row), highlights: [] }))): ToolResponse {
  const recommendations = rows.map(serializeRecommendation);
  const structuredContent = { count: recommendations.length, recommendations };

  return ok(structuredContent, `${structuredContent.count} recommendations found.`, {
    recommendations: meta,
  });
}

export async function listRecommendations(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.read");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const query = supabase
    .from("recommendations")
    .select("id, job_id, candidate_id, rank, overall, summary_ko, is_synthetic, subscores")
    .eq("app_user_id", actor.appUserId)
    .order("rank", { ascending: true })
    .limit(10);

  const { data, error } = await query.returns<RecommendationRow[]>();

  if (error) {
    throw new Error("Unable to list recommendations");
  }

  const rows = data ?? [];
  const photosByCandidate = await signedPrimaryPhotosByCandidate(rows.map((row) => row.candidate_id), supabase);

  return toRecommendationResponse(
    rows,
    rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      rank: row.rank ?? 0,
      subscores: serializeRecommendationSubscores(row),
      highlights: [],
      ...(photosByCandidate.get(row.candidate_id) ? { photoUrl: photosByCandidate.get(row.candidate_id) } : {}),
    })),
  );
}

async function signedPrimaryPhotosByCandidate(candidateIds: string[], supabase: ReturnType<typeof getServiceSupabase>): Promise<Map<string, string>> {
  if (candidateIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.from("photos").select("id, app_user_id, bucket, path, moderation_status, is_primary").in("app_user_id", candidateIds).eq("bucket", "profile-private").order("is_primary", { ascending: false }).returns<PhotoRow[]>();
  if (error || !data) {
    return new Map();
  }

  const signedByCandidate = new Map<string, string>();
  for (const photo of displayablePhotos(data)) {
    if (signedByCandidate.has(photo.app_user_id)) {
      continue;
    }
    const { data: signed } = await supabase.storage.from("profile-private").createSignedUrl(photo.path, 60 * 10);
    if (signed?.signedUrl) {
      signedByCandidate.set(photo.app_user_id, signed.signedUrl);
    }
  }

  return signedByCandidate;
}

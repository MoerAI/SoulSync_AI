import { displayablePhotos } from "../safety/moderation";
import { serializeRecommendationSubscores, serializeRecommendations, type RecommendationSerializableRow } from "../serializers";
import type { CoreServiceContext } from "./types";

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

export type RecommendationMeta = {
  id: string;
  candidateId: string;
  rank: number;
  subscores: Record<string, number>;
  highlights: string[];
  photoUrl?: string;
};

export type RecommendationListResult = {
  rows: RecommendationRow[];
  serialized: ReturnType<typeof serializeRecommendations>;
  meta: RecommendationMeta[];
};

type PhotoRow = {
  id: string;
  app_user_id: string;
  bucket: string;
  path: string;
  moderation_status: string | null;
  is_primary: boolean | null;
};

type RecommendationInterestRow = { id: string; subscores: unknown };

export const listRecommendations = async (input: { jobId?: string; limit?: number; includePhotoUrls?: boolean } | undefined, context: CoreServiceContext): Promise<RecommendationListResult> => {
  const limit = input?.limit ?? 10;
  let query = context.client
    .from("recommendations")
    .select("id, job_id, candidate_id, rank, overall, summary_ko, is_synthetic, subscores")
    .eq("app_user_id", context.actor.appUserId)
    .order("rank", { ascending: true })
    .limit(limit);

  if (input?.jobId) {
    query = query.eq("job_id", input.jobId);
  }

  const { data, error } = await query.returns<RecommendationRow[]>();
  if (error) {
    throw new Error("Unable to list recommendations");
  }

  const rows = data ?? [];
  const photosByCandidate = input?.includePhotoUrls === false ? new Map<string, string>() : await signedPrimaryPhotosByCandidate(rows.map((row) => row.candidate_id), context);

  return {
    rows,
    serialized: serializeRecommendations(rows),
    meta: rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      rank: row.rank ?? 0,
      subscores: serializeRecommendationSubscores(row),
      highlights: [],
      ...(photosByCandidate.get(row.candidate_id) ? { photoUrl: photosByCandidate.get(row.candidate_id) } : {}),
    })),
  };
};

export const saveRecommendation = async (input: { recommendationId: string }, { client, actor }: CoreServiceContext): Promise<{ recommendationId: string; saved: true }> => {
  const { data, error } = await client.from("recommendations").select("id, subscores").eq("id", input.recommendationId).eq("app_user_id", actor.appUserId).single<RecommendationInterestRow>();

  if (error || !data) {
    throw new Error("Unable to save recommendation");
  }

  const subscores = data.subscores && typeof data.subscores === "object" && !Array.isArray(data.subscores) ? data.subscores : {};
  const update = await client.from("recommendations").update({ subscores: { ...subscores, user_interest_saved: true } }).eq("id", input.recommendationId).eq("app_user_id", actor.appUserId);
  if (update.error) {
    throw new Error("Unable to save recommendation");
  }

  return { recommendationId: input.recommendationId, saved: true };
};

const signedPrimaryPhotosByCandidate = async (candidateIds: string[], { client }: CoreServiceContext): Promise<Map<string, string>> => {
  if (candidateIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client.from("photos").select("id, app_user_id, bucket, path, moderation_status, is_primary").in("app_user_id", candidateIds).eq("bucket", "profile-private").order("is_primary", { ascending: false }).returns<PhotoRow[]>();
  if (error || !data) {
    return new Map();
  }

  const signedByCandidate = new Map<string, string>();
  for (const photo of displayablePhotos(data)) {
    if (signedByCandidate.has(photo.app_user_id)) {
      continue;
    }
    const { data: signed } = await client.storage.from("profile-private").createSignedUrl(photo.path, 60 * 10);
    if (signed?.signedUrl) {
      signedByCandidate.set(photo.app_user_id, signed.signedUrl);
    }
  }

  return signedByCandidate;
};

export const recommendationMetaFromRows = (rows: RecommendationSerializableRow[]): RecommendationMeta[] =>
  rows.map((row) => ({
    id: row.id,
    candidateId: String(row.candidate_id ?? row.candidateId ?? ""),
    rank: row.rank ?? 0,
    subscores: serializeRecommendationSubscores(row),
    highlights: [],
  }));

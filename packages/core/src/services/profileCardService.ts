import { CardArtifactSchema, type CardArtifact } from "../cardgen/types";
import { signedDisplayablePhotosByCandidate } from "./recommendationService";
import type { CoreServiceContext } from "./types";

type ProfileCardRow = {
  html: unknown;
  css: unknown;
  placeholders: unknown;
  profile_version: unknown;
  generator_version: unknown;
  is_synthetic: unknown;
};

type RowId = { id: string };

export const enqueueProfileCardGeneration = async (appUserId: string, { client }: CoreServiceContext): Promise<{ enqueued: boolean; jobId?: string }> => {
  const existing = await client.from("profile_card_jobs").select("id").eq("app_user_id", appUserId).in("status", ["queued", "running"]).limit(1).maybeSingle<RowId>();
  if (existing.error) {
    throw new Error("Unable to inspect profile card jobs");
  }
  if (existing.data) {
    return { enqueued: false };
  }

  const { data, error } = await client.from("profile_card_jobs").insert({ app_user_id: appUserId, status: "queued" }).select("id").single<RowId>();
  if (error || !data) {
    throw new Error("Unable to enqueue profile card generation");
  }

  return { enqueued: true, jobId: data.id };
};

export const getProfileCard = async ({ client, actor }: CoreServiceContext): Promise<CardArtifact | null> => loadLatestProfileCard(actor.appUserId, client);

export const getProfileCardForViewer = async (input: { candidateId?: string }, context: CoreServiceContext): Promise<{ card: CardArtifact | null; photos: Record<string, string> }> => {
  const targetAppUserId = input.candidateId ?? context.actor.appUserId;

  if (input.candidateId !== undefined) {
    const recommendation = await context.client
      .from("recommendations")
      .select("id")
      .eq("candidate_id", input.candidateId)
      .eq("app_user_id", context.actor.appUserId)
      .limit(1)
      .maybeSingle<RowId>();
    if (recommendation.error) {
      throw new Error("Unable to verify profile card viewer recommendation");
    }
    if (!recommendation.data) {
      return { card: null, photos: {} };
    }
  }

  const card = await loadLatestProfileCard(targetAppUserId, context.client);
  if (!card) {
    return { card: null, photos: {} };
  }

  const signedPhotos = await signedDisplayablePhotosByCandidate([targetAppUserId], context, 3);
  const urls = signedPhotos.get(targetAppUserId) ?? [];
  const photos = Object.fromEntries(card.placeholders.slice(0, urls.length).map((placeholder, index) => [placeholder, urls[index]]));

  return { card, photos };
};

const loadLatestProfileCard = async (appUserId: string, client: CoreServiceContext["client"]): Promise<CardArtifact | null> => {
  const { data, error } = await client
    .from("profile_cards")
    .select("html, css, placeholders, profile_version, generator_version, is_synthetic")
    .eq("app_user_id", appUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProfileCardRow>();
  if (error) {
    throw new Error("Unable to load profile card");
  }
  if (!data) {
    return null;
  }

  const artifact = CardArtifactSchema.safeParse({
    version: data.profile_version,
    generatorVersion: data.generator_version,
    html: data.html,
    css: data.css,
    placeholders: data.placeholders,
    is_synthetic: data.is_synthetic,
  });

  return artifact.success ? artifact.data : null;
};

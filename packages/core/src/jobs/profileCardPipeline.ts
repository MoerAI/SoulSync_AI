import { buildCardGenInput, compileCardArtifact, createGguiGenerator, type GguiLike } from "../cardgen";
import { generatePersona as defaultGeneratePersona } from "../persona";
import { displayablePhotos } from "../safety/moderation";
import { PersonaSpecSchema, type PersonaSpec, type Profile } from "../types";
import type { QueryLike, SupabaseLike } from "./pipeline";

const STYLE = "default";
const GENERATOR_VERSION = "ggui-card-v1";
const PHOTO_SLOTS = ["slot-1", "slot-2", "slot-3"] as const;

type ProfileCardJobResult = {
  jobId: string;
  status: "succeeded" | "failed" | "cancelled";
  cardWritten: boolean;
};

type ProfileCardPipelineDeps = {
  client: SupabaseLike;
  ggui?: GguiLike;
  now?: () => Date;
};

type ProfileCardJobRow = {
  id: string;
  app_user_id: string;
  status: string;
  progress?: number;
  error?: string | null;
};

type ProfileRow = {
  id: string;
  app_user_id: string;
  city?: string | null;
  district?: string | null;
  mbti?: string | null;
  religion_type?: string | null;
  religion_intensity?: number | null;
  values?: unknown;
  visibility?: string | null;
  is_synthetic?: boolean | null;
  salary_band?: string | null;
  profile_text?: string | null;
  persona_spec?: unknown;
  updated_at?: string | null;
};

type PhotoRow = {
  id: string;
  app_user_id: string;
  bucket: string;
  path: string;
  moderation_status?: string | null;
  is_primary?: boolean | null;
};

export const runProfileCardJob = async (jobId: string, deps: ProfileCardPipelineDeps): Promise<ProfileCardJobResult> => {
  const client = deps.client;
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const job = await loadJob(client, jobId);

  if (job.status === "cancelled") {
    return cancelledResult(jobId);
  }

  try {
    await updateJob(client, jobId, { status: "running", progress: 5, updated_at: now() });

    const profile = await loadProfile(client, job.app_user_id);
    const persona = await personaForProfile(profile);

    if (await isCancelled(client, jobId)) {
      return cancelledResult(jobId);
    }

    const approvedPhotos = await loadApprovedPhotos(client, job.app_user_id);
    const selectedPhotos = approvedPhotos.slice(0, PHOTO_SLOTS.length);
    const photoSlots = selectedPhotos.map((_, index) => PHOTO_SLOTS[index]).filter(isPresent);
    const profileCardVersion = profileVersion(profile);
    const input = buildCardGenInput(profileForCard(profile), persona, true, photoSlots);
    const generator = deps.ggui ?? createGguiGenerator();

    if (await isCancelled(client, jobId)) {
      return cancelledResult(jobId);
    }

    const output = await generator.generateCard(input);
    const artifact = compileCardArtifact(output, {
      version: profileCardVersion,
      generatorVersion: GENERATOR_VERSION,
      is_synthetic: Boolean(profile.is_synthetic),
      photoSlots,
    });

    if (await isCancelled(client, jobId)) {
      return cancelledResult(jobId);
    }

    await upsertProfileCard(client, {
      app_user_id: profile.app_user_id,
      html: artifact.html,
      css: artifact.css,
      placeholders: artifact.placeholders,
      style: STYLE,
      generator_version: GENERATOR_VERSION,
      photo_fingerprint: photoFingerprint(selectedPhotos),
      profile_version: profileCardVersion,
      status: "ready",
      is_synthetic: artifact.is_synthetic,
      updated_at: now(),
    });
    await updateJob(client, jobId, { status: "succeeded", progress: 100, updated_at: now() });

    return { jobId, status: "succeeded", cardWritten: true };
  } catch (error) {
    await updateJob(client, jobId, { status: "failed", error: errorMessage(error), updated_at: now() });

    return { jobId, status: "failed", cardWritten: false };
  }
};

const loadJob = async (client: SupabaseLike, jobId: string): Promise<ProfileCardJobRow> => {
  const { data, error } = await client.from<ProfileCardJobRow>("profile_card_jobs").select("*").eq("id", jobId).single();

  if (error || !data) {
    throw new Error(`Unable to load profile card job ${jobId}`);
  }

  return data;
};

const loadProfile = async (client: SupabaseLike, appUserId: string): Promise<ProfileRow> => {
  const { data, error } = await client.from<ProfileRow>("profiles").select("*").eq("app_user_id", appUserId).single();

  if (error || !data) {
    throw new Error(`Unable to load profile for user ${appUserId}`);
  }

  return data;
};

const loadApprovedPhotos = async (client: SupabaseLike, appUserId: string): Promise<PhotoRow[]> => {
  let query: QueryLike<PhotoRow> = client
    .from<PhotoRow>("photos")
    .select("id, app_user_id, bucket, path, moderation_status, is_primary")
    .eq("app_user_id", appUserId)
    .eq("bucket", "profile-private");

  if (query.order) {
    query = query.order("is_primary", { ascending: false });
  }

  const { data, error } = await query;

  if (error || !data) {
    throw new Error(`Unable to load profile photos for user ${appUserId}`);
  }

  return displayablePhotos(data);
};

const personaForProfile = async (profile: ProfileRow): Promise<PersonaSpec> => {
  const parsed = PersonaSpecSchema.safeParse(profile.persona_spec);

  if (parsed.success) {
    return parsed.data;
  }

  return defaultGeneratePersona(profileForCard(profile), true);
};

const upsertProfileCard = async (client: SupabaseLike, row: Record<string, unknown>): Promise<void> => {
  const query = client.from("profile_cards");
  const result = query.upsert
    ? await query.upsert(row, { onConflict: "app_user_id,profile_version,photo_fingerprint,style,generator_version" })
    : await query.insert(row);

  if (result.error) {
    throw new Error("Unable to persist profile card");
  }
};

const updateJob = async (client: SupabaseLike, jobId: string, values: Record<string, unknown>): Promise<void> => {
  const result = await client.from("profile_card_jobs").update(values).eq("id", jobId);

  if (result.error) {
    throw new Error(`Unable to update profile card job ${jobId}`);
  }
};

const isCancelled = async (client: SupabaseLike, jobId: string): Promise<boolean> => (await loadJob(client, jobId)).status === "cancelled";

const cancelledResult = (jobId: string): ProfileCardJobResult => ({
  jobId,
  status: "cancelled",
  cardWritten: false,
});

const profileForCard = (profile: ProfileRow): Profile => ({
  id: profile.id,
  userId: profile.app_user_id,
  visibility: profile.visibility === "discoverable" ? "discoverable" : "private",
  is_synthetic: Boolean(profile.is_synthetic),
  location: {
    city: profile.city ?? "",
    district: profile.district ?? "",
  },
  salaryBand: profile.salary_band ?? undefined,
  answers: {
    mbti: profile.mbti ?? "",
    religionType: profile.religion_type ?? "",
    values: isRecord(profile.values) ? JSON.stringify(profile.values) : "",
    selfIntro: profile.profile_text ?? "",
  },
});

const profileVersion = (profile: Pick<ProfileRow, "id" | "updated_at">): string => `${profile.id}:${profile.updated_at ?? "unversioned"}`;

const photoFingerprint = (photos: readonly PhotoRow[]): string => {
  const source = photos
    .map((photo) => `${photo.id}:${photo.path}`)
    .sort()
    .join("|");

  return `fnv1a:${fnv1a(source)}`;
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isPresent = (value: string | undefined): value is string => typeof value === "string";

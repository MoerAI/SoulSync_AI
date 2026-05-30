import { enqueueMatchJob } from "@soulsync/core/src/jobs/enqueue";
import { generatePersona as coreGeneratePersona, updatePersona as coreUpdatePersona, type PersonaConsent, type PersonaTalkingPoints } from "@soulsync/core/src/persona/index";
import { blockProfile as coreBlockProfile, deleteAccount as coreDeleteAccount, reportProfile as coreReportProfile } from "@soulsync/core/src/safety/enforcement";
import { serializeBlock, serializeDeleteAccount, serializeMatchJob, serializePersona, serializePhotoUpload, serializeProfileStep, serializeRecommendations, serializeReport } from "@soulsync/core/src/serializers";
import type { McpActor } from "@soulsync/core/src/identity/index";
import type { PersonaSpec, Profile } from "@soulsync/core/src/types/index";

export type ServiceClient = {
  from: (table: string) => any;
  storage?: {
    from(bucket: string): {
      createSignedUploadUrl?: (path: string) => Promise<{ data: { signedUrl?: string; path?: string; token?: string } | null; error: unknown }>;
    };
  };
};

type RecommendationRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  rank: number | null;
  overall: number | string | null;
  summary_ko: string | null;
  is_synthetic: boolean | null;
  subscores?: unknown;
};

type MatchJobRow = {
  id: string;
  app_user_id: string;
  status: string;
  progress?: number | null;
};

type ProfileRow = {
  id: string;
  app_user_id: string;
  visibility: "private" | "discoverable" | null;
  is_synthetic: boolean | null;
  city: string | null;
  district: string | null;
  salary_band: string | null;
  profile_text: string | null;
};

type AnswerRow = {
  question_id: string;
  answer: unknown;
};

type ProfilePersonaRow = {
  persona_spec: unknown;
  is_synthetic: boolean | null;
};

export const saveMobileProfileStep = async (actor: McpActor, input: { step: string; data: Record<string, unknown> }, client: ServiceClient): Promise<Record<string, unknown>> => {
  const profilePatch = profilePatchFrom(input.data);
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await client.from("profiles").upsert({ app_user_id: actor.appUserId, ...profilePatch, updated_at: new Date().toISOString() }, { onConflict: "app_user_id" });
    if (error) {
      throw new Error("Unable to save profile step");
    }
  }

  const answers = Object.entries(input.data.answers && typeof input.data.answers === "object" ? (input.data.answers as Record<string, unknown>) : input.data);
  if (answers.length > 0) {
    const { error } = await client.from("profile_answers").insert(
      answers.map(([questionId, answer]) => ({
        app_user_id: actor.appUserId,
        question_id: `${input.step}:${questionId}`,
        answer,
        privacy_class: "profile_step",
      })),
    );
    if (error) {
      throw new Error("Unable to save profile answers");
    }
  }

  return serializeProfileStep({ step: input.step });
};

export const generateMobilePersona = async (actor: McpActor, input: { consent?: PersonaConsent }, client: ServiceClient): Promise<Record<string, unknown>> => {
  const persona = await coreGeneratePersona(await loadProfile(actor.appUserId, client), input.consent ?? true);
  const { error } = await client.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", actor.appUserId);
  if (error) {
    throw new Error("Unable to save generated persona");
  }

  return { persona: serializePersona(persona) };
};

export const updateMobilePersona = async (actor: McpActor, input: { updates: Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }, client: ServiceClient): Promise<Record<string, unknown>> => {
  const { data, error } = (await client.from("profiles").select("persona_spec, is_synthetic").eq("app_user_id", actor.appUserId).single()) as { data: ProfilePersonaRow | null; error: unknown };
  if (error || !data || !data.persona_spec || typeof data.persona_spec !== "object") {
    throw new Error("Unable to load persona for update");
  }

  const persona = coreUpdatePersona({ ...(data.persona_spec as PersonaSpec), is_synthetic: Boolean(data.is_synthetic) || Boolean((data.persona_spec as PersonaSpec).is_synthetic) }, input.updates);
  const updateResult = await client.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", actor.appUserId);
  if (updateResult.error) {
    throw new Error("Unable to update persona");
  }

  return { persona: serializePersona(persona) };
};

export const createMobilePhotoUpload = async (actor: McpActor, input: { fileName: string }, client: ServiceClient): Promise<Record<string, unknown>> => {
  const fileName = sanitizeFileName(input.fileName || "profile-photo.bin");
  const path = `${actor.appUserId}/${Date.now()}-${fileName}`;
  const signed = await client.storage?.from("profile-private").createSignedUploadUrl?.(path);
  if (signed?.error) {
    throw new Error("Unable to create signed photo upload");
  }

  const { data, error } = (await client.from("photos").insert({ app_user_id: actor.appUserId, bucket: "profile-private", path, moderation_status: "pending", is_primary: false }).select("id").single()) as { data: { id: string } | null; error: unknown };
  if (error || !data) {
    throw new Error("Unable to save profile photo");
  }

  return { ...serializePhotoUpload({ photoId: data.id }), upload: { url: signed?.data?.signedUrl ?? null, path: signed?.data?.path ?? path, token: signed?.data?.token ?? null } };
};

export const enqueueMobileMatchJob = async (actor: McpActor, client: ServiceClient): Promise<Record<string, unknown>> => serializeMatchJob({ jobId: await enqueueMatchJob({ source: "mobile", id: actor.appUserId }, client as never), status: "queued" });

export const getMobileMatchJob = async (actor: McpActor, jobId: string, client: ServiceClient): Promise<Record<string, unknown>> => {
  const { data, error } = (await client.from("match_jobs").select("id, app_user_id, status, progress").eq("id", jobId).eq("app_user_id", actor.appUserId).single()) as { data: MatchJobRow | null; error: unknown };
  if (error || !data) {
    throw new Error(`Unable to load match job ${jobId}`);
  }

  return serializeMatchJob({ jobId: data.id, status: data.status, progress: data.progress ?? 0 });
};

export const listMobileRecommendations = async (actor: McpActor, input: { jobId?: string; limit?: number }, client: ServiceClient): Promise<Record<string, unknown>> => {
  let query = client.from("recommendations").select("id, job_id, candidate_id, rank, overall, summary_ko, is_synthetic, subscores").eq("app_user_id", actor.appUserId).order?.("rank", { ascending: true }).limit?.(input.limit ?? 3) ?? client.from("recommendations").select("id, job_id, candidate_id, rank, overall, summary_ko, is_synthetic, subscores").eq("app_user_id", actor.appUserId);
  if (input.jobId) {
    query = query.eq("job_id", input.jobId);
  }
  const { data, error } = (await query.returns()) as { data: RecommendationRow[] | null; error: unknown };
  if (error) {
    throw new Error("Unable to list recommendations");
  }

  return serializeRecommendations(data ?? []);
};

export const reportMobileProfile = async (actor: McpActor, input: { profileId: string; reason: string }, client: ServiceClient): Promise<Record<string, unknown>> => serializeReport({ reportId: (await coreReportProfile({ reporterId: actor.appUserId, reportedId: input.profileId, reason: input.reason }, client as never)).id });

export const blockMobileProfile = async (actor: McpActor, input: { profileId: string }, client: ServiceClient): Promise<Record<string, unknown>> => serializeBlock({ blockId: (await coreBlockProfile({ blockerId: actor.appUserId, blockedId: input.profileId }, client as never)).id, blockedProfileId: input.profileId });

export const deleteMobileAccount = async (actor: McpActor, client: ServiceClient): Promise<Record<string, unknown>> => {
  await coreDeleteAccount(actor.appUserId, client as never);

  return serializeDeleteAccount();
};

const loadProfile = async (appUserId: string, client: ServiceClient): Promise<Profile> => {
  const [{ data: profileRow, error: profileError }, { data: answerRows, error: answerError }] = (await Promise.all([
    client.from("profiles").select("id, app_user_id, visibility, is_synthetic, city, district, salary_band, profile_text").eq("app_user_id", appUserId).single(),
    client.from("profile_answers").select("question_id, answer").eq("app_user_id", appUserId).returns(),
  ])) as [{ data: ProfileRow | null; error: unknown }, { data: AnswerRow[] | null; error: unknown }];
  if (profileError || !profileRow || answerError) {
    throw new Error("Unable to load profile for persona generation");
  }

  return {
    id: profileRow.id,
    userId: profileRow.app_user_id,
    visibility: profileRow.visibility ?? "private",
    is_synthetic: Boolean(profileRow.is_synthetic),
    location: { city: profileRow.city ?? "", district: profileRow.district ?? "" },
    salaryBand: profileRow.salary_band ?? undefined,
    answers: Object.fromEntries((answerRows ?? []).map((row: AnswerRow) => [row.question_id, normalizeAnswer(row.answer)])),
  };
};

const profilePatchFrom = (data: Record<string, unknown>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const key of ["gender", "interested_in", "city", "district", "mbti", "mbti_scores", "religion_type", "religion_intensity", "values", "visibility", "profile_text"] as const) {
    if (data[key] !== undefined) {
      patch[key] = data[key];
    }
  }

  return patch;
};

const normalizeAnswer = (answer: unknown): string | number | boolean | string[] => {
  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
    return answer;
  }
  if (Array.isArray(answer) && answer.every((item) => typeof item === "string")) {
    return answer;
  }

  return JSON.stringify(answer ?? "");
};

const sanitizeFileName = (fileName: string): string => fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

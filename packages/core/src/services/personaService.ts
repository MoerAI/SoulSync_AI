import { generatePersona as generateCorePersona, updatePersona as updateCorePersona, type PersonaConsent, type PersonaPreview, type PersonaTalkingPoints } from "../persona";
import type { PersonaSpec, Profile } from "../types";
import { enqueueProfileCardGeneration } from "./profileCardService";
import type { CoreServiceContext } from "./types";

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

type AnswerRow = { question_id: string; answer: unknown };
type ProfilePersonaRow = { persona_spec: unknown; is_synthetic: boolean | null };

export const generatePersonaForActor = async (input: { consent?: PersonaConsent } | undefined, context: CoreServiceContext): Promise<PersonaPreview> => {
  const profile = await loadProfileForPersona(context);
  const persona = await generateCorePersona(profile, input?.consent ?? true);
  const { error } = await context.client.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", context.actor.appUserId);

  if (error) {
    throw new Error("Unable to save generated persona");
  }

  try {
    await enqueueProfileCardGeneration(context.actor.appUserId, context);
  } catch (enqueueError) {
    console.warn("profile card enqueue failed", enqueueError);
  }

  return persona;
};

export const updatePersonaForActor = async (input: { updates: Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }, { client, actor }: CoreServiceContext): Promise<PersonaPreview> => {
  const { data, error } = await client.from("profiles").select("persona_spec, is_synthetic").eq("app_user_id", actor.appUserId).single<ProfilePersonaRow>();
  if (error || !data || !data.persona_spec || typeof data.persona_spec !== "object") {
    throw new Error("Unable to load persona for update");
  }

  const original = { ...(data.persona_spec as PersonaSpec), is_synthetic: Boolean(data.is_synthetic) || Boolean((data.persona_spec as PersonaSpec).is_synthetic) };
  const persona = updateCorePersona(original, input.updates);
  const updateResult = await client.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", actor.appUserId);
  if (updateResult.error) {
    throw new Error("Unable to update persona");
  }

  return persona;
};

export const loadProfileForPersona = async ({ client, actor }: CoreServiceContext): Promise<Profile> => {
  const [{ data: profileRow, error: profileError }, answerResult] = await Promise.all([
    client.from("profiles").select("id, app_user_id, visibility, is_synthetic, city, district, salary_band, profile_text").eq("app_user_id", actor.appUserId).single<ProfileRow>(),
    client.from("profile_answers").select("question_id, answer").eq("app_user_id", actor.appUserId),
  ]);
  if (profileError || !profileRow || answerResult.error) {
    throw new Error("Unable to load profile for persona generation");
  }
  const answerRows = (answerResult.data ?? []) as unknown as AnswerRow[];

  return {
    id: profileRow.id,
    userId: profileRow.app_user_id,
    visibility: profileRow.visibility ?? "private",
    is_synthetic: Boolean(profileRow.is_synthetic),
    location: { city: profileRow.city ?? "", district: profileRow.district ?? "" },
    salaryBand: profileRow.salary_band ?? undefined,
    answers: Object.fromEntries((answerRows ?? []).map((row) => [row.question_id, normalizeAnswer(row.answer)])),
  };
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

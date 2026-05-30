import { generatePersona as coreGeneratePersona, type PersonaConsent } from "@soulsync/core/src/persona/index";
import type { Profile } from "@soulsync/core/src/types/index";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const generatePersonaInput = {
  consent: z.union([z.boolean(), z.record(z.string(), z.unknown())]).optional(),
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

export async function generatePersona(input: { consent?: PersonaConsent } = {}): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const profile = await loadProfile(actor.appUserId);
  const persona = await coreGeneratePersona(profile, input.consent ?? true);
  const { error } = await supabase.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", actor.appUserId);

  if (error) {
    rowError("Unable to save generated persona");
  }

  return ok({ persona: safePersona(persona) }, "Persona generated.", {
    persona: {
      ...safePersona(persona),
      allowedTalkingPoints: persona.allowedTalkingPoints,
      forbiddenTopics: persona.forbiddenTopics,
    },
  });
}

async function loadProfile(appUserId: string): Promise<Profile> {
  const supabase = getServiceSupabase();
  const [{ data: profileRow, error: profileError }, { data: answerRows, error: answerError }] = await Promise.all([
    supabase.from("profiles").select("id, app_user_id, visibility, is_synthetic, city, district, salary_band, profile_text").eq("app_user_id", appUserId).single<ProfileRow>(),
    supabase.from("profile_answers").select("question_id, answer").eq("app_user_id", appUserId).returns<AnswerRow[]>(),
  ]);

  if (profileError || !profileRow || answerError) {
    rowError("Unable to load profile for persona generation");
  }

  return {
    id: profileRow.id,
    userId: profileRow.app_user_id,
    visibility: profileRow.visibility ?? "private",
    is_synthetic: Boolean(profileRow.is_synthetic),
    location: { city: profileRow.city ?? "", district: profileRow.district ?? "" },
    salaryBand: profileRow.salary_band ?? undefined,
    answers: Object.fromEntries((answerRows ?? []).map((row) => [row.question_id, normalizeAnswer(row.answer)])),
  };
}

function normalizeAnswer(answer: unknown): string | number | boolean | string[] {
  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
    return answer;
  }
  if (Array.isArray(answer) && answer.every((item) => typeof item === "string")) {
    return answer;
  }

  return JSON.stringify(answer ?? "");
}

function safePersona(persona: Awaited<ReturnType<typeof coreGeneratePersona>>): Record<string, unknown> {
  return {
    id: persona.id,
    displayName: persona.displayName,
    ageRange: persona.ageRange,
    city: persona.city,
    mbti: persona.mbti,
    values: persona.values,
    interests: persona.interests,
    communicationStyle: persona.communicationStyle,
    boundaries: persona.boundaries,
    is_synthetic: persona.is_synthetic,
  };
}

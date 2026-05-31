import { writeConsent } from "../safety/enforcement";
import type { CoreServiceContext } from "./types";
import { asEnforcementClient } from "./types";

export type SaveProfileStepInput = { step: string; data: Record<string, unknown> };
export type SaveProfileConsentInput = { consents: Array<{ scope: string; granted: boolean }>; version: string; locale?: string; source?: string };

const PROFILE_PATCH_KEYS = ["gender", "interested_in", "city", "district", "mbti", "mbti_scores", "religion_type", "religion_intensity", "values", "visibility", "profile_text"] as const;

export const saveProfileStep = async (input: SaveProfileStepInput, { client, actor }: CoreServiceContext): Promise<{ step: string }> => {
  const profilePatch = profilePatchFrom(input.data);
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await client.from("profiles").upsert({ app_user_id: actor.appUserId, ...profilePatch, updated_at: new Date().toISOString() }, { onConflict: "app_user_id" });
    if (error) {
      throw new Error("Unable to save profile step");
    }
  }

  const answersSource = input.data.answers && typeof input.data.answers === "object" && !Array.isArray(input.data.answers) ? (input.data.answers as Record<string, unknown>) : input.data;
  const answers = Object.entries(answersSource);
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

  return { step: input.step };
};

export const saveProfileConsent = async (input: SaveProfileConsentInput, { client, actor }: CoreServiceContext): Promise<{ ids: string[] }> => {
  const ids: string[] = [];
  for (const consent of input.consents) {
    const result = await writeConsent(
      {
        appUserId: actor.appUserId,
        scope: consent.scope,
        granted: consent.granted,
        version: input.version,
        locale: input.locale ?? "ko",
        source: input.source ?? actor.source,
      },
      asEnforcementClient(client),
    );
    ids.push(result.id);
  }

  return { ids };
};

const profilePatchFrom = (data: Record<string, unknown>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const key of PROFILE_PATCH_KEYS) {
    if (data[key] !== undefined) {
      patch[key] = data[key];
    }
  }

  return patch;
};

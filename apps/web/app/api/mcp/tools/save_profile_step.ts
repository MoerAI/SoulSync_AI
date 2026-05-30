import { serializeProfileStep } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveProfileStepInput = {
  step: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1).optional(),
};

export async function saveProfileStep(input: { step: string; data: Record<string, unknown>; idempotencyKey?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const profilePatch = profilePatchFrom(input.data);

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase.from("profiles").upsert({ app_user_id: actor.appUserId, ...profilePatch, updated_at: new Date().toISOString() }, { onConflict: "app_user_id" });
    if (error) {
      rowError("Unable to save profile step");
    }
  }

  const answers = Object.entries(input.data.answers && typeof input.data.answers === "object" ? (input.data.answers as Record<string, unknown>) : input.data);
  if (answers.length > 0) {
    const { error } = await supabase.from("profile_answers").insert(
      answers.map(([questionId, answer]) => ({
        app_user_id: actor.appUserId,
        question_id: `${input.step}:${questionId}`,
        answer,
        privacy_class: "profile_step",
      })),
    );
    if (error) {
      rowError("Unable to save profile answers");
    }
  }

  return ok(serializeProfileStep({ step: input.step }), "Profile step saved.");
}

function profilePatchFrom(data: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ["gender", "interested_in", "city", "district", "mbti", "mbti_scores", "religion_type", "religion_intensity", "values", "visibility", "profile_text"] as const) {
    if (data[key] !== undefined) {
      patch[key] = data[key];
    }
  }

  return patch;
}

import { updatePersona as coreUpdatePersona, type PersonaTalkingPoints } from "@soulsync/core/src/persona/index";
import { serializePersonaMeta, serializePersonaSummary } from "@soulsync/core/src/serializers";
import type { PersonaSpec } from "@soulsync/core/src/types/index";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const updatePersonaInput = {
  edits: z.record(z.string(), z.unknown()),
};

type ProfilePersonaRow = {
  persona_spec: unknown;
  is_synthetic: boolean | null;
};

export async function updatePersona(input: { edits: Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("profiles").select("persona_spec, is_synthetic").eq("app_user_id", actor.appUserId).single<ProfilePersonaRow>();

  if (error || !data || !data.persona_spec || typeof data.persona_spec !== "object") {
    rowError("Unable to load persona for update");
  }

  const original = { ...(data.persona_spec as PersonaSpec), is_synthetic: Boolean(data.is_synthetic) || Boolean((data.persona_spec as PersonaSpec).is_synthetic) };
  const persona = coreUpdatePersona(original, input.edits);
  const { error: updateError } = await supabase.from("profiles").update({ persona_spec: persona, persona_updated_at: new Date().toISOString() }).eq("app_user_id", actor.appUserId);

  if (updateError) {
    rowError("Unable to update persona");
  }

  return ok(serializePersonaSummary(persona), "Persona updated.", { persona: serializePersonaMeta(persona) });
}

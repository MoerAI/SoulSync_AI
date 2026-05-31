import { updatePersonaForActor } from "@soulsync/core/src/services/personaService";
import { serializePersonaMeta, serializePersonaSummary } from "@soulsync/core/src/serializers";
import type { PersonaTalkingPoints } from "@soulsync/core/src/persona/index";
import type { PersonaSpec } from "@soulsync/core/src/types/index";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const updatePersonaInput = {
  edits: z.record(z.string(), z.unknown()),
};

export async function updatePersona(input: { edits: Partial<PersonaSpec> & Partial<PersonaTalkingPoints> }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const persona = await updatePersonaForActor({ updates: input.edits }, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!persona) {
    rowError("Unable to update persona");
  }

  return ok(serializePersonaSummary(persona), "Persona updated.", { persona: serializePersonaMeta(persona) });
}

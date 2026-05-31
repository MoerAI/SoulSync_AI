import { generatePersonaForActor } from "@soulsync/core/src/services/personaService";
import { serializePersonaMeta, serializePersonaSummary } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const generatePersonaInput = {};

export async function generatePersona(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const persona = await generatePersonaForActor(undefined, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!persona) {
    rowError("Unable to save generated persona");
  }

  return ok(serializePersonaSummary(persona), "Persona generated.", { persona: serializePersonaMeta(persona) });
}

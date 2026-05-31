import { saveProfileConsent as saveProfileConsentService } from "@soulsync/core/src/services/profileService";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveProfileConsentInput = {
  consents: z.array(z.object({ scope: z.string().min(1), granted: z.boolean() }).strict()).min(1),
  version: z.string().min(1),
};

export async function saveProfileConsent(input: { consents: Array<{ scope: string; granted: boolean }>; version: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await saveProfileConsentService({ ...input, source: "mcp_widget" }, { client: getServiceSupabase(), actor }).catch(() => null);
  if (!result) {
    rowError("Unable to save profile consent");
  }

  return ok({ saved: true, count: result.ids.length }, "Profile consent saved.", { consentIds: result.ids });
}

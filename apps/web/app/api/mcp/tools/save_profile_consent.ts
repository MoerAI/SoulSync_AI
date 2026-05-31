import { writeConsent } from "@soulsync/core/src/safety/enforcement";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, asEnforcementClient, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const saveProfileConsentInput = {
  consents: z.array(z.object({ scope: z.string().min(1), granted: z.boolean() }).strict()).min(1),
  version: z.string().min(1),
};

export async function saveProfileConsent(input: { consents: Array<{ scope: string; granted: boolean }>; version: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const supabase = getServiceSupabase();
  const ids: string[] = [];

  for (const consent of input.consents) {
    const result = await writeConsent(
      {
        appUserId: actor.appUserId,
        scope: consent.scope,
        granted: consent.granted,
        version: input.version,
        locale: "ko",
        source: "mcp_widget",
      },
      asEnforcementClient(supabase),
    ).catch(() => null);
    if (!result) {
      rowError("Unable to save profile consent");
    }
    ids.push(result.id);
  }

  return ok({ saved: true, count: ids.length }, "Profile consent saved.", { consentIds: ids });
}

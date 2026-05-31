import { reportProfile as coreReportProfile } from "@soulsync/core/src/safety/enforcement";
import { serializeReport } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, asEnforcementClient, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const reportProfileInput = {
  candidateId: z.string().min(1),
  reason: z.string().min(1).max(500).optional(),
};

export async function reportProfile(input: { candidateId: string; reason?: string }): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await coreReportProfile({ reporterId: actor.appUserId, reportedId: input.candidateId, reason: input.reason ?? "profile_report" }, asEnforcementClient(getServiceSupabase())).catch(() => null);

  if (!result) {
    rowError("Unable to report profile");
  }

  return ok(serializeReport({ reportId: result.id }), "Profile reported.");
}

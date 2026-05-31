import { deleteAccount as coreDeleteAccount } from "@soulsync/core/src/safety/enforcement";
import { serializeDeleteAccount } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, asEnforcementClient, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const deleteAccountInput = {};

export async function deleteAccount(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const deleted = await coreDeleteAccount(actor.appUserId, asEnforcementClient(getServiceSupabase()))
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    rowError("Unable to delete account");
  }

  return ok(serializeDeleteAccount(), "Account deleted.");
}

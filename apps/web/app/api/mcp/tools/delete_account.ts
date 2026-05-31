import { deleteAccount as deleteAccountService } from "@soulsync/core/src/services/safetyService";
import { serializeDeleteAccount } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const deleteAccountInput = {};

export async function deleteAccount(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const deleted = await deleteAccountService({ client: getServiceSupabase(), actor })
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    rowError("Unable to delete account");
  }

  return ok(serializeDeleteAccount(), "Account deleted.");
}

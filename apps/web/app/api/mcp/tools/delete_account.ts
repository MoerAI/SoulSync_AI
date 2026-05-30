import { deleteAccount as coreDeleteAccount } from "@soulsync/core/src/safety/enforcement";
import { serializeDeleteAccount } from "@soulsync/core/src/serializers";
import { z } from "zod";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, rowError, type ToolResponse } from "./common";
import { currentClaims } from "./context";

export const deleteAccountInput = {
  confirm: z.literal("DELETE"),
  idempotencyKey: z.string().min(1).optional(),
};

export async function deleteAccount(input: { confirm: "DELETE"; idempotencyKey?: string }): Promise<ToolResponse> {
  void input;
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const deleted = await coreDeleteAccount(actor.appUserId, getServiceSupabase() as never)
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    rowError("Unable to delete account");
  }

  return ok(serializeDeleteAccount(), "Account deleted.");
}

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
  const { error } = await getServiceSupabase().from("app_users").delete().eq("id", actor.appUserId);

  if (error) {
    rowError("Unable to delete account");
  }

  return ok({ deleted: true }, "Account deleted.");
}

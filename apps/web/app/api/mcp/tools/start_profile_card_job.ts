import type { McpActor } from "@soulsync/core/src/identity/index";
import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { enqueueProfileCardGeneration } from "@soulsync/core/src/services/profileCardService";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

type StartProfileCardJobDeps = { enqueueProfileCardGeneration?: (appUserId: string, context: { client: SupabaseClient; actor: McpActor }) => Promise<{ enqueued: boolean; jobId?: string }> };

export const startProfileCardJobInput = {};

export async function startProfileCardJobTool(actor: McpActor, client: SupabaseClient | SupabaseLike, deps: StartProfileCardJobDeps = {}): Promise<ToolResponse> {
  const serviceClient = client as unknown as SupabaseClient;
  const result = await (deps.enqueueProfileCardGeneration ?? enqueueProfileCardGeneration)(actor.appUserId, { client: serviceClient, actor });

  return toProfileCardJobResponse(result.enqueued);
}

export async function startProfileCardJob(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "profile.write");
  const actor = actorFor(claims);
  const result = await enqueueProfileCardGeneration(actor.appUserId, { client: getServiceSupabase(), actor });

  return toProfileCardJobResponse(result.enqueued);
}

const toProfileCardJobResponse = (enqueued: boolean): ToolResponse =>
  ok({ enqueued }, enqueued ? "Profile card generation queued." : "Profile card generation already in progress.", {});

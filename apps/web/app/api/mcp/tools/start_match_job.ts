import { startMatchJob as startMatchJobService } from "@soulsync/core/src/services/matchService";
import type { McpActor } from "@soulsync/core/src/identity/index";
import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeMatchJob } from "@soulsync/core/src/serializers";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

type StartMatchJobDeps = { startMatchJob?: (context: { client: SupabaseClient; actor: McpActor }) => Promise<{ jobId: string; status: "queued" }> };

export const startMatchJobInput = {};

export async function startMatchJobTool(actor: McpActor, client: SupabaseClient | SupabaseLike, deps: StartMatchJobDeps = {}): Promise<ToolResponse> {
  const serviceClient = client as unknown as SupabaseClient;
  const job = await (deps.startMatchJob ?? ((context) => startMatchJobService(context)))({ client: serviceClient, actor });

  return ok(serializeMatchJob(job), "Match job queued.");
}

export async function startMatchJob(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "match.run");

  return startMatchJobTool(actorFor(claims), getServiceSupabase());
}

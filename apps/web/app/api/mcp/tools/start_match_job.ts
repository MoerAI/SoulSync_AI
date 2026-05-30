import { enqueueMatchJob as coreEnqueueMatchJob } from "@soulsync/core/src/jobs/enqueue";
import type { McpActor } from "@soulsync/core/src/identity/index";
import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";

import { getServiceSupabase } from "../../../../lib/supabase";
import { actorFor, ok, requireScope, type ToolResponse } from "./common";
import { currentClaims } from "./context";

type Deps = {
  enqueueMatchJob?: (actor: McpActor, client: SupabaseLike) => Promise<string>;
};

export async function startMatchJobTool(actor: McpActor, client: SupabaseLike, deps: Deps = {}): Promise<ToolResponse> {
  const jobId = await (deps.enqueueMatchJob ?? coreEnqueueMatchJob)(actor, client);

  return ok({ jobId, status: "queued" }, "Match job queued.");
}

export async function startMatchJob(): Promise<ToolResponse> {
  const claims = currentClaims();
  requireScope(claims, "match.run");

  return startMatchJobTool(actorFor(claims), getServiceSupabase() as unknown as SupabaseLike);
}

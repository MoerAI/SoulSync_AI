import type { SupabaseClient } from "@supabase/supabase-js";

import type { McpActor } from "../identity";
import type { EnforcementClient } from "../safety/enforcement";
import type { SupabaseLike } from "../jobs/pipeline";

export type CoreServiceContext = {
  client: SupabaseClient;
  actor: McpActor;
};

export const asSupabaseLike = (client: SupabaseClient): SupabaseLike => client as unknown as SupabaseLike;
export const asEnforcementClient = (client: SupabaseClient): EnforcementClient => client as unknown as EnforcementClient;

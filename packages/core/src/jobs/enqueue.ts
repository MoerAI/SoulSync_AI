import { ActorSchema, type Actor } from "../types";
import type { SupabaseLike } from "./pipeline";

type MatchJobRow = {
  id: string;
  app_user_id: string;
  status: string;
  progress?: number;
};

export const enqueueMatchJob = async (actor: Actor, client: SupabaseLike): Promise<string> => {
  const parsedActor = ActorSchema.parse(actor);

  if (!parsedActor.id) {
    throw new Error("enqueueMatchJob requires actor.id to identify the matching user");
  }

  const existing = await findQueuedOrRunningJob(client, parsedActor.id);
  if (existing) {
    return existing.id;
  }

  const { data, error } = await client
    .from<MatchJobRow>("match_jobs")
    .insert({ app_user_id: parsedActor.id, status: "queued", progress: 0 })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Unable to enqueue match job for user ${parsedActor.id}`);
  }

  return data.id;
};

const findQueuedOrRunningJob = async (client: SupabaseLike, appUserId: string): Promise<MatchJobRow | null> => {
  const query = client.from<MatchJobRow>("match_jobs").select("*").eq("app_user_id", appUserId);
  const statusScoped = query.in ? query.in("status", ["queued", "running"]) : query;
  const limited = statusScoped.order?.("created_at", { ascending: false }).limit?.(1) ?? statusScoped;
  const { data } = limited.maybeSingle ? await limited.maybeSingle() : await limited.single();

  return data && (data.status === "queued" || data.status === "running") ? data : null;
};

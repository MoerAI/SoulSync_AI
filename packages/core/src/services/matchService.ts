import { enqueueMatchJob } from "../jobs/enqueue";
import { serializeMatchJob } from "../serializers";
import type { CoreServiceContext } from "./types";
import { asSupabaseLike } from "./types";

type MatchJobRow = { id: string; app_user_id: string; status: string; progress?: number | null };

export const startMatchJob = async ({ client, actor }: CoreServiceContext): Promise<{ jobId: string; status: "queued" }> => ({
  jobId: await enqueueMatchJob(actor, asSupabaseLike(client)),
  status: "queued",
});

export const getMatchJob = async (input: { jobId: string }, { client, actor }: CoreServiceContext): Promise<ReturnType<typeof serializeMatchJob> & { rawStatus: string; rawProgress: number }> => {
  const { data, error } = await client.from("match_jobs").select("id, app_user_id, status, progress").eq("id", input.jobId).eq("app_user_id", actor.appUserId).single<MatchJobRow>();

  if (error || !data) {
    throw new Error(`Unable to load match job ${input.jobId}`);
  }

  const progress = data.progress ?? 0;

  return { ...serializeMatchJob({ jobId: data.id, status: data.status, progress }), rawStatus: data.status || "unknown", rawProgress: progress };
};

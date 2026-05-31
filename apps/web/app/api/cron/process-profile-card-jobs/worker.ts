import { createGguiGenerator } from "@soulsync/core/src/cardgen";
import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { runProfileCardJob } from "@soulsync/core/src/jobs/profileCardPipeline";
import { authenticateCron } from "../process-match-jobs/worker";

const DEFAULT_BATCH_SIZE = 10;

type QueuedProfileCardJobRow = {
  id: string;
};

type WorkerSummary = {
  processed: number;
  succeeded: number;
  failed: number;
};

export { authenticateCron };

export async function processProfileCardJobs({ client }: { client: SupabaseLike }): Promise<WorkerSummary> {
  const summary: WorkerSummary = { processed: 0, succeeded: 0, failed: 0 };
  const queuedJobs = await listQueuedJobs(client);

  for (const job of queuedJobs) {
    summary.processed += 1;

    try {
      const result = await runProfileCardJob(job.id, { client, ggui: createGguiGenerator() });

      if (result.status === "succeeded") {
        summary.succeeded += 1;
      } else {
        summary.failed += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}

async function listQueuedJobs(client: SupabaseLike): Promise<QueuedProfileCardJobRow[]> {
  const query = client.from<QueuedProfileCardJobRow>("profile_card_jobs").select("id").eq("status", "queued");
  const ordered = query.order ? query.order("created_at", { ascending: true }) : query;
  const limited = ordered.limit ? ordered.limit(DEFAULT_BATCH_SIZE) : ordered;
  const { data, error } = await limited;

  if (error || !data) {
    throw new Error("Unable to list queued profile card jobs");
  }

  return data;
}

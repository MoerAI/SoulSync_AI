import type { FriendliLike } from "@soulsync/core/src/friendli";
import { runMatchJob as coreRunMatchJob, type MatchJobResult, type SupabaseLike } from "@soulsync/core/src/jobs/pipeline";

const DEFAULT_BATCH_SIZE = 3;

type WorkerClient = SupabaseLike;
type QueuedJobRow = {
  id: string;
  app_user_id: string;
};
type WorkerSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  jobIds: string[];
};
type ProcessMatchJobsOptions = {
  client: WorkerClient;
  limit?: number;
  runMatchJob?: (jobId: string, deps: { client: WorkerClient }) => Promise<MatchJobResult>;
  now?: () => Date;
};

export function authenticateCron(request: Request): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 403, error: "Cron secret is not configured" };
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  if (authorization === `Bearer ${secret}` || headerSecret === secret) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

export async function processMatchJobs(options: ProcessMatchJobsOptions): Promise<WorkerSummary> {
  const client = options.client;
  const limit = Math.max(0, options.limit ?? DEFAULT_BATCH_SIZE);
  const runMatchJob = options.runMatchJob ?? ((jobId, deps) => coreRunMatchJob(jobId, { client: deps.client, friendli: friendliForWorker() }));
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const summary: WorkerSummary = { claimed: 0, succeeded: 0, failed: 0, cancelled: 0, jobIds: [] };
  const queuedJobs = await listQueuedJobs(client, limit);

  for (const queuedJob of queuedJobs) {
    const claimedJob = await claimQueuedJob(client, queuedJob.id, now);
    if (!claimedJob) {
      continue;
    }

    summary.claimed += 1;
    summary.jobIds.push(claimedJob.id);

    try {
      const result = await runMatchJob(claimedJob.id, { client });
      if (result.status === "cancelled") {
        summary.cancelled += 1;
      } else {
        await insertCompletionNotification(client, claimedJob, result, now);
        summary.succeeded += 1;
      }
    } catch {
      summary.failed += 1;
      await returnJobToQueue(client, claimedJob.id, now);
    }
  }

  return summary;
}

export function withVectorRpc(client: WorkerClient): WorkerClient {
  return {
    from: client.from.bind(client),
    rpc: (name, args) => client.rpc(name, normalizeRpcArgs(args)),
  };
}

export async function claimQueuedJob(client: WorkerClient, jobId: string, now: () => string = () => new Date().toISOString()): Promise<QueuedJobRow | null> {
  const query = client
    .from<QueuedJobRow>("match_jobs")
    .update({ status: "running", progress: 1, updated_at: now() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, app_user_id");
  const { data, error } = query.maybeSingle ? await query.maybeSingle() : await query.single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function listQueuedJobs(client: WorkerClient, limit: number): Promise<QueuedJobRow[]> {
  if (limit === 0) {
    return [];
  }

  const query = client.from<QueuedJobRow>("match_jobs").select("id, app_user_id").eq("status", "queued");
  const ordered = query.order ? query.order("created_at", { ascending: true }) : query;
  const limited = ordered.limit ? ordered.limit(limit) : ordered;
  const { data, error } = await limited;
  if (error || !data) {
    throw new Error("Unable to list queued match jobs");
  }

  return data;
}

async function insertCompletionNotification(client: WorkerClient, job: QueuedJobRow, result: MatchJobResult, now: () => string): Promise<void> {
  const insert = await client.from("notifications").insert({
    app_user_id: job.app_user_id,
    type: "match_job_succeeded",
    job_id: job.id,
    payload: {
      jobId: job.id,
      status: result.status,
      recommendationCount: result.recommendations.length,
      realtimeChannel: `match-job-${job.id}`,
    },
    read: false,
    created_at: now(),
  });

  if (insert.error) {
    throw new Error(`Unable to notify match job completion for ${job.id}`);
  }
}

async function returnJobToQueue(client: WorkerClient, jobId: string, now: () => string): Promise<void> {
  const result = await client.from("match_jobs").update({ status: "queued", progress: 0, updated_at: now() }).eq("id", jobId).eq("status", "running");
  if (result.error) {
    throw new Error(`Unable to return failed match job ${jobId} to queue`);
  }
}

function normalizeRpcArgs(args: Record<string, unknown>): Record<string, unknown> {
  const queryEmbedding = args.query_embedding;
  if (!Array.isArray(queryEmbedding)) {
    return args;
  }

  return { ...args, query_embedding: `[${queryEmbedding.join(",")}]` };
}

function friendliForWorker(): FriendliLike | undefined {
  if (process.env.FRIENDLI_API_KEY) {
    return undefined;
  }

  return unavailableFriendli;
}

const unavailableFriendli: FriendliLike = {
  async chat() {
    throw new Error("Friendli API key is not configured for match job LLM calls");
  },
  async chatJSON() {
    throw new Error("Friendli API key is not configured for match job LLM calls");
  },
};

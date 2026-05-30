// @ts-expect-error Supabase Edge Functions resolve npm specifiers in Deno.
import { createClient } from "npm:@supabase/supabase-js@2";

import type { FriendliLike } from "../../../packages/core/src/friendli/index.ts";
import { runMatchJob, type MatchJobResult, type SupabaseLike } from "../../../packages/core/src/jobs/pipeline.ts";

const DEFAULT_BATCH_SIZE = 3;

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

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

Deno.serve(async (request) => {
  const auth = authenticateCron(request);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Supabase service credentials are not configured" }, 500);
  }

  const client = withVectorRpc(createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseLike);
  const summary = await processMatchJobs(client);

  return json({ ok: true, primary: "vercel-cron", fallback: "supabase-edge-function", ...summary });
});

function authenticateCron(request: Request): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) {
    return { ok: false, status: 403, error: "Cron secret is not configured" };
  }

  if (request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

async function processMatchJobs(client: SupabaseLike): Promise<WorkerSummary> {
  const queuedJobs = await listQueuedJobs(client, DEFAULT_BATCH_SIZE);
  const summary: WorkerSummary = { claimed: 0, succeeded: 0, failed: 0, cancelled: 0, jobIds: [] };

  for (const queuedJob of queuedJobs) {
    const claimedJob = await claimQueuedJob(client, queuedJob.id);
    if (!claimedJob) {
      continue;
    }

    summary.claimed += 1;
    summary.jobIds.push(claimedJob.id);

    try {
      const result = await runMatchJob(claimedJob.id, { client, friendli: friendliForWorker() });
      if (result.status === "cancelled") {
        summary.cancelled += 1;
      } else {
        await insertCompletionNotification(client, claimedJob, result);
        summary.succeeded += 1;
      }
    } catch {
      summary.failed += 1;
      await returnJobToQueue(client, claimedJob.id);
    }
  }

  return summary;
}

async function listQueuedJobs(client: SupabaseLike, limit: number): Promise<QueuedJobRow[]> {
  const query = client.from<QueuedJobRow>("match_jobs").select("id, app_user_id").eq("status", "queued");
  const ordered = query.order ? query.order("created_at", { ascending: true }) : query;
  const limited = ordered.limit ? ordered.limit(limit) : ordered;
  const { data, error } = await limited;
  if (error || !data) {
    throw new Error("Unable to list queued match jobs");
  }

  return data;
}

async function claimQueuedJob(client: SupabaseLike, jobId: string): Promise<QueuedJobRow | null> {
  const query = client
    .from<QueuedJobRow>("match_jobs")
    .update({ status: "running", progress: 1, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, app_user_id");
  const { data, error } = query.maybeSingle ? await query.maybeSingle() : await query.single();

  return error || !data ? null : data;
}

async function insertCompletionNotification(client: SupabaseLike, job: QueuedJobRow, result: MatchJobResult): Promise<void> {
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
  });

  if (insert.error) {
    throw new Error(`Unable to notify match job completion for ${job.id}`);
  }
}

async function returnJobToQueue(client: SupabaseLike, jobId: string): Promise<void> {
  const result = await client.from("match_jobs").update({ status: "queued", progress: 0, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running");
  if (result.error) {
    throw new Error(`Unable to return failed match job ${jobId} to queue`);
  }
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withVectorRpc(client: SupabaseLike): SupabaseLike {
  return {
    from: client.from.bind(client),
    rpc: (name, args) => client.rpc(name, normalizeRpcArgs(args)),
  };
}

function normalizeRpcArgs(args: Record<string, unknown>): Record<string, unknown> {
  const queryEmbedding = args.query_embedding;
  if (!Array.isArray(queryEmbedding)) {
    return args;
  }

  return { ...args, query_embedding: `[${queryEmbedding.join(",")}]` };
}

function friendliForWorker(): FriendliLike | undefined {
  if (Deno.env.get("FRIENDLI_API_KEY")) {
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

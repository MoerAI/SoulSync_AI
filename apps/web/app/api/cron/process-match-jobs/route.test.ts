import { describe, expect, test, vi } from "vitest";

import type { SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import { GET } from "./route";
import { claimQueuedJob, processMatchJobs } from "./worker";

const ACTOR_ID = "93000000-0000-0000-0000-000000000001";

describe("process-match-jobs cron route", () => {
  test("rejects requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const response = await GET(new Request("http://localhost/api/cron/process-match-jobs"));

    expect([401, 403]).toContain(response.status);
  });

  test("processes a queued job and writes a completion notification", async () => {
    const client = new FakeWorkerSupabase();
    const jobId = client.insertJob(ACTOR_ID);
    const transitions: string[] = [];

    const summary = await processMatchJobs({
      client: asWorkerClient(client),
      limit: 1,
      runMatchJob: async (claimedJobId) => {
        transitions.push(String(client.rows.match_jobs.find((row) => row.id === claimedJobId)?.status));
        await client.from("match_jobs").update({ status: "succeeded", progress: 100 }).eq("id", claimedJobId);
        return { jobId: claimedJobId, status: "succeeded", recommendations: [], fallbackTrace: [], candidateStatuses: [] };
      },
    });

    expect(transitions).toEqual(["running"]);
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
    expect(client.rows.match_jobs.find((row) => row.id === jobId)?.status).toBe("succeeded");
    expect(client.rows.notifications).toMatchObject([
      {
        app_user_id: ACTOR_ID,
        type: "match_job_succeeded",
        job_id: jobId,
        read: false,
      },
    ]);
  });

  test("two concurrent workers do not double-claim the same queued job", async () => {
    const client = new FakeWorkerSupabase();
    const jobId = client.insertJob(ACTOR_ID);

    const [firstClaim, secondClaim] = await Promise.all([claimQueuedJob(asWorkerClient(client), jobId), claimQueuedJob(asWorkerClient(client), jobId)]);

    expect([firstClaim, secondClaim].filter(Boolean)).toHaveLength(1);
    expect(client.rows.match_jobs.find((row) => row.id === jobId)?.status).toBe("running");
  });

  test("failed processing returns the job to queued for retry", async () => {
    const client = new FakeWorkerSupabase();
    const jobId = client.insertJob(ACTOR_ID);

    const summary = await processMatchJobs({
      client: asWorkerClient(client),
      limit: 1,
      runMatchJob: async () => {
        throw new Error("friendli unavailable");
      },
    });

    expect(summary).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 });
    expect(client.rows.match_jobs.find((row) => row.id === jobId)).toMatchObject({ status: "queued", progress: 0 });
    expect(client.rows.notifications).toHaveLength(0);
  });
});

class FakeWorkerSupabase {
  rows: Record<string, Record<string, unknown>[]> = {
    match_jobs: [],
    notifications: [],
  };

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  async rpc(): Promise<{ data: Record<string, unknown>[]; error: null }> {
    return { data: [], error: null };
  }

  insertJob(appUserId: string): string {
    const id = `94000000-0000-0000-0000-${String(this.rows.match_jobs.length + 1).padStart(12, "0")}`;
    this.rows.match_jobs.push({ id, app_user_id: appUserId, status: "queued", progress: 0, created_at: now(), updated_at: now() });

    return id;
  }
}

class FakeQuery implements PromiseLike<{ data: Record<string, unknown>[]; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "update" = "select";
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private limitCount = Number.POSITIVE_INFINITY;

  constructor(private readonly client: FakeWorkerSupabase, private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(): this {
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  async single(): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
    const result = await this.execute();
    return { data: result.data[0] ?? null, error: result.data[0] ? null : new Error("not found") };
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    const result = await this.execute();
    return { data: result.data[0] ?? null, error: null };
  }

  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: Record<string, unknown>[]; error: null }> {
    const table = this.client.rows[this.table];
    const matched = table.filter((row) => this.matches(row));

    if (this.operation === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = payloads.map((payload, index) => ({ id: payload.id ?? `${this.table}-${table.length + index + 1}`, ...payload }));
      table.push(...inserted);
      return { data: inserted, error: null };
    }

    if (this.operation === "update") {
      matched.forEach((row) => Object.assign(row, this.payload, { updated_at: now() }));
      return { data: matched.slice(0, this.limitCount), error: null };
    }

    return { data: matched.slice(0, this.limitCount), error: null };
  }

  private matches(row: Record<string, unknown>): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }
}

const now = (): string => "2026-05-31T00:00:00.000Z";
const asWorkerClient = (client: FakeWorkerSupabase): SupabaseLike => client as unknown as SupabaseLike;

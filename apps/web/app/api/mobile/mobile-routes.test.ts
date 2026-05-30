import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { serializeMatchJob, serializeRecommendations } from "@soulsync/core/src/serializers";
import { toRecommendationResponse, type RecommendationRow } from "../mcp/tools/list_recommendations";
import { POST as postMatchJobs } from "./match-jobs/route";
import { GET as getRecommendations } from "./recommendations/route";

const supabaseHolder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("../../../lib/supabase", () => ({
  getServiceSupabase: () => supabaseHolder.client,
  getSupabaseJwtIdentityClient: () => ({
    async findAppUserBySupabaseUserId(supabaseUserId: string) {
      const client = supabaseHolder.client as FakeMobileSupabase;

      return client.rows.app_users.find((row) => row.supabase_user_id === supabaseUserId) ?? null;
    },
  }),
}));

const jwtSecret = "soulsync-supabase-jwt-test-secret";
const supabaseUrl = "http://127.0.0.1:54321";
const supabaseUserId = "99000000-0000-0000-0000-000000000001";
const appUserId = "99000000-0000-0000-0000-000000000101";

describe("mobile REST route parity", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = jwtSecret;
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_JWT_AUDIENCE = "authenticated";
    supabaseHolder.client = new FakeMobileSupabase();
  });

  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_JWT_AUDIENCE;
  });

  test("GET /api/mobile/recommendations without JWT returns 401", async () => {
    const response = await getRecommendations(new Request("http://localhost/api/mobile/recommendations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_token" });
  });

  test("GET /api/mobile/recommendations with JWT deep-equals the shared MCP serializer output", async () => {
    const client = supabaseHolder.client as FakeMobileSupabase;
    const recommendation: RecommendationRow = {
      id: "rec-1",
      job_id: "job-1",
      candidate_id: "99000000-0000-0000-0000-000000000202",
      rank: 1,
      overall: "92.5",
      summary_ko: "대화 흐름과 가치관 신호가 안정적입니다.",
      is_synthetic: false,
      app_user_id: appUserId,
      subscores: { flow: 22, raw_transcript: "private", salary: "1억" },
    } as RecommendationRow & { app_user_id: string };
    client.rows.recommendations.push(recommendation as unknown as Record<string, unknown>);

    const response = await getRecommendations(
      new Request("http://localhost/api/mobile/recommendations?limit=1", {
        headers: { authorization: `Bearer ${await signSupabaseJwt()}` },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(serializeRecommendations([recommendation]));
    expect(payload).toEqual(toRecommendationResponse([recommendation]).structuredContent);
    expect(JSON.stringify(payload)).not.toMatch(/salary|transcript|private/i);
  });

  test("POST /api/mobile/match-jobs returns the shared queued job serializer output", async () => {
    const response = await postMatchJobs(
      new Request("http://localhost/api/mobile/match-jobs", {
        method: "POST",
        headers: { authorization: `Bearer ${await signSupabaseJwt()}` },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(serializeMatchJob({ jobId: "match_jobs-1", status: "queued" }));
  });

  test("mobile route files stay thin and avoid inline Supabase business queries", async () => {
    const routeFiles = [
      "profile/step/route.ts",
      "persona/generate/route.ts",
      "persona/update/route.ts",
      "photo/route.ts",
      "match-jobs/route.ts",
      "match-jobs/[id]/route.ts",
      "recommendations/route.ts",
      "report/route.ts",
      "block/route.ts",
      "account/route.ts",
    ];

    for (const routeFile of routeFiles) {
      const source = await readFile(new URL(`./${routeFile}`, import.meta.url), "utf8");

      expect(source).not.toMatch(/\.from\(|\.rpc\(|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
      expect(source).toMatch(/withMobileActor|actorFromSupabaseJwt/);
    }
  });
});

const signSupabaseJwt = async (): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      aud: "authenticated",
      role: "authenticated",
      email: "mobile-user@example.test",
      iss: `${supabaseUrl}/auth/v1`,
      sub: supabaseUserId,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");

  return `${header}.${payload}.${signature}`;
};

const base64Url = (value: string): string => Buffer.from(value).toString("base64url");

class FakeMobileSupabase {
  rows: Record<string, Record<string, unknown>[]> = {
    app_users: [{ id: appUserId, supabase_user_id: supabaseUserId }],
    match_jobs: [],
    recommendations: [],
  };

  from(table: string): FakeMobileQuery {
    return new FakeMobileQuery(this, table);
  }
}

class FakeMobileQuery implements PromiseLike<{ data: Record<string, unknown>[]; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" = "select";
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private limitCount = Number.POSITIVE_INFINITY;

  constructor(private readonly client: FakeMobileSupabase, private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push([column, new Set(values)]);
    return this;
  }

  order(): this {
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  returns<T>(): Promise<{ data: T; error: null }> {
    return this.execute().then((result) => ({ data: result.data as T, error: null }));
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
    const table = this.client.rows[this.table] ?? [];
    const matched = table.filter((row) => this.matches(row));

    if (this.operation === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = payloads.map((payload, index) => ({ id: payload.id ?? `${this.table}-${table.length + index + 1}`, ...payload }));
      table.push(...inserted);
      this.client.rows[this.table] = table;
      return { data: inserted, error: null };
    }

    return { data: matched.slice(0, this.limitCount), error: null };
  }

  private matches(row: Record<string, unknown>): boolean {
    return this.filters.every(([column, value]) => (value instanceof Set ? value.has(row[column]) : row[column] === value));
  }
}

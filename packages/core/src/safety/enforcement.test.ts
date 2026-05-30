import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { funnel, type FunnelCandidate, type FunnelUser } from "../scoring/funnel";
import { blockProfile, deleteAccount, excludeBlockedCandidates, reportProfile, withdrawConsent, writeConsent, type EnforcementClient } from "./enforcement";

const runId = randomUUID().replace(/-/g, "").slice(0, 12);
const city = `테스트안전시-${runId}`;
function uuid(sequence: number): string {
  return `a22${runId.slice(0, 5)}-${runId.slice(5, 9)}-4000-8000-${sequence.toString().padStart(12, "0")}`;
}

const userA = uuid(1);
const userB = uuid(2);
const userC = uuid(3);
const profileA = uuid(11);
const profileB = uuid(12);
const profileC = uuid(13);

describe("enforcement persistence", () => {
  test("persists blocks, reports, consent grants, and consent withdrawals through the injected client", async () => {
    const client = new FakeClient();
    const safetyClient = client as unknown as EnforcementClient;

    const block = await blockProfile({ blockerId: "user-a", blockedId: "user-b" }, safetyClient);
    const duplicate = await blockProfile({ blockerId: "user-a", blockedId: "user-b" }, safetyClient);
    const report = await reportProfile({ reporterId: "user-a", reportedId: "user-b", reason: "unsafe message" }, safetyClient);
    await writeConsent({ appUserId: "user-a", scope: "profile_matching", version: "2026-05-31", granted: true, locale: "ko", source: "onboarding" }, safetyClient);
    await withdrawConsent({ appUserId: "user-a", scope: "profile_matching", version: "2026-05-31", locale: "ko", source: "settings" }, safetyClient);

    expect(block.id).toBe(duplicate.id);
    expect(report.id).toMatch(/reports-/);
    expect(client.rows.blocks).toEqual([{ id: block.id, blocker_id: "user-a", blocked_id: "user-b" }]);
    expect(client.rows.reports).toHaveLength(1);
    expect(client.rows.consents.map((row) => row.granted)).toEqual([true, false]);
  });

  test("removes blocked candidates before invoking the pure funnel", () => {
    const user: FunnelUser = { id: "user-a", gender: "female", interested_in: ["male"], location: { city, district: "테스트구" } };
    const candidates = [candidate("user-b"), candidate("user-c")];
    const visible = excludeBlockedCandidates(user.id, candidates, [{ blocker_id: "user-a", blocked_id: "user-b" }]);
    const result = funnel(user, visible);

    expect(result.candidates.map((item) => item.id)).not.toContain("user-b");
  });

  test("deleteAccount hides discovery and removes dependent rows through the injected client", async () => {
    const client = new FakeClient();
    client.rows.app_users.push({ id: "user-b" });
    client.rows.profiles.push({ id: "profile-b", app_user_id: "user-b", visibility: "discoverable" });
    client.rows.photos.push({ id: "photo-b", app_user_id: "user-b" });
    client.rows.profile_embeddings.push({ profile_id: "profile-b" });
    client.rows.blocks.push({ id: "block-1", blocker_id: "user-a", blocked_id: "user-b" });
    client.rows.reports.push({ id: "report-1", reporter_id: "user-a", reported_id: "user-b" });
    client.rows.match_simulations.push({ id: "sim-1", user_a: "user-a", user_b: "user-b" });
    client.rows.recommendations.push({ id: "rec-1", app_user_id: "user-a", candidate_id: "user-b" });
    client.rows.consents.push({ id: "consent-1", app_user_id: "user-b" });

    await deleteAccount("user-b", client as unknown as EnforcementClient);

    expect(client.rows.profiles.some((row) => row.app_user_id === "user-b")).toBe(false);
    expect(client.rows.app_users.some((row) => row.id === "user-b")).toBe(false);
    expect(client.rows.photos.some((row) => row.app_user_id === "user-b")).toBe(false);
    expect(client.rows.profile_embeddings.some((row) => row.profile_id === "profile-b")).toBe(false);
    expect(client.rows.blocks.some((row) => row.blocker_id === "user-b" || row.blocked_id === "user-b")).toBe(false);
    expect(client.rows.reports.some((row) => row.reporter_id === "user-b" || row.reported_id === "user-b")).toBe(false);
    expect(client.rows.match_simulations.some((row) => row.user_a === "user-b" || row.user_b === "user-b")).toBe(false);
    expect(client.rows.recommendations.some((row) => row.app_user_id === "user-b" || row.candidate_id === "user-b")).toBe(false);
    expect(client.rows.consents.some((row) => row.app_user_id === "user-b")).toBe(false);
  });
});

describe("match_candidate_profiles block enforcement", () => {
  beforeAll(seedRpcRows);
  afterAll(cleanupRpcRows);

  test("excludes a blocked candidate in both directions inside a unique city", () => {
    const output = psql(`
      select app_user_id::text
      from public.match_candidate_profiles(
        ${sqlString(userA)}::uuid,
        '${vectorLiteral(1, 0)}'::extensions.vector(384),
        10,
        0,
        'female',
        array['male'],
        ${sqlString(city)},
        null
      );
    `);

    expect(output.split("\n").filter(Boolean)).toEqual([userC]);
  });
});

describe("policy documents", () => {
  test("ship privacy, AI, synthetic-profile, and retention policies with a data-class table and no-training default", () => {
    const policyDir = join(process.cwd(), "content/policies");
    const files = ["privacy-policy.md", "ai-disclosure.md", "synthetic-profile-policy.md", "retention-deletion.md"];

    for (const file of files) {
      const path = join(policyDir, file);
      expect(existsSync(path), `${file} exists`).toBe(true);
      const text = readFileSync(path, "utf8");
      expect(text).toContain("NO training");
      expect(text).toMatch(/public\s*\|\s*matching_private\s*\|\s*internal/i);
    }
  });
});

const seedRpcRows = (): void => {
  cleanupRpcRows();
  psql(`
    insert into public.app_users (id, display_name, is_synthetic) values
      (${sqlString(userA)}::uuid, 'safety-query-${runId}', false),
      (${sqlString(userB)}::uuid, 'safety-blocked-${runId}', false),
      (${sqlString(userC)}::uuid, 'safety-visible-${runId}', false);

    insert into public.profiles (id, app_user_id, gender, interested_in, city, district, visibility, is_synthetic, persona_spec) values
      (${sqlString(profileA)}::uuid, ${sqlString(userA)}::uuid, 'female', array['male'], ${sqlString(city)}, '테스트구', 'discoverable', false, ${jsonb(persona(userA, 'Query'))}),
      (${sqlString(profileB)}::uuid, ${sqlString(userB)}::uuid, 'male', array['female'], ${sqlString(city)}, '테스트구', 'discoverable', false, ${jsonb(persona(userB, 'Blocked'))}),
      (${sqlString(profileC)}::uuid, ${sqlString(userC)}::uuid, 'male', array['female'], ${sqlString(city)}, '테스트구', 'discoverable', false, ${jsonb(persona(userC, 'Visible'))});

    insert into public.profile_embeddings (profile_id, embedding_model, embedding) values
      (${sqlString(profileA)}::uuid, 'test', '${vectorLiteral(1, 0)}'::extensions.vector(384)),
      (${sqlString(profileB)}::uuid, 'test', '${vectorLiteral(0.99, 0.01)}'::extensions.vector(384)),
      (${sqlString(profileC)}::uuid, 'test', '${vectorLiteral(0.9, 0.1)}'::extensions.vector(384));

    insert into public.blocks (blocker_id, blocked_id) values (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid);
  `);
};

const cleanupRpcRows = (): void => {
  psql(`
    delete from public.blocks where blocker_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid) or blocked_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid);
    delete from public.reports where reporter_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid) or reported_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid);
    delete from public.recommendations where app_user_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid) or candidate_id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid);
    delete from public.match_simulations where user_a in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid) or user_b in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid);
    delete from public.profile_embeddings where profile_id in (${sqlString(profileA)}::uuid, ${sqlString(profileB)}::uuid, ${sqlString(profileC)}::uuid);
    delete from public.profiles where id in (${sqlString(profileA)}::uuid, ${sqlString(profileB)}::uuid, ${sqlString(profileC)}::uuid);
    delete from public.app_users where id in (${sqlString(userA)}::uuid, ${sqlString(userB)}::uuid, ${sqlString(userC)}::uuid);
  `);
};

const candidate = (id: string): FunnelCandidate => ({
  id,
  profileId: `profile-${id}`,
  gender: "male",
  interested_in: ["female"],
  persona: { id: `persona-${id}`, displayName: id, city, district: "테스트구", interests: [], boundaries: [], is_synthetic: false },
});

const persona = (id: string, displayName: string): Record<string, unknown> => ({
  id,
  displayName,
  city,
  district: "테스트구",
  interests: [],
  boundaries: [],
  is_synthetic: false,
});

const vectorLiteral = (first: number, second: number): string => `[${[first, second, ...Array.from({ length: 382 }, () => 0)].join(",")}]`;
const sqlString = (value: string | null): string => (value === null ? "null" : `'${value.split("'").join("''")}'`);
const jsonb = (value: Record<string, unknown>): string => `${sqlString(JSON.stringify(value))}::jsonb`;
const psql = (sql: string): string => execFileSync("docker", ["exec", "-i", process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_soulsync-ai", "psql", "-U", "postgres", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();

type Row = Record<string, unknown>;

class FakeClient {
  rows: Record<string, Row[]> = {
    app_users: [],
    profiles: [],
    photos: [],
    profile_embeddings: [],
    profile_answers: [],
    match_jobs: [],
    external_identities: [],
    blocks: [],
    reports: [],
    consents: [],
    match_simulations: [],
    recommendations: [],
  };

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflictColumns: string[] = [];

  constructor(private readonly client: FakeClient, private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictColumns = options?.onConflict?.split(",").map((column) => column.trim()) ?? [];
    return this;
  }

  update(payload: Row): this {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  async single(): Promise<{ data: Row | null; error: Error | null }> {
    const result = await this.execute();
    return { data: result.data[0] ?? null, error: result.data[0] ? null : new Error("not found") };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: Row[]; error: null }> {
    const table = this.client.rows[this.table];
    const matched = table.filter((row) => this.matches(row));

    if (this.operation === "insert") {
      const inserted = this.payloads().map((payload) => ({ id: payload.id ?? `${this.table}-${table.length + 1}`, ...payload }));
      table.push(...inserted);
      return { data: inserted, error: null };
    }

    if (this.operation === "upsert") {
      const output: Row[] = [];
      for (const payload of this.payloads()) {
        const existing = table.find((row) => this.conflictColumns.length > 0 && this.conflictColumns.every((column) => row[column] === payload[column]));
        if (existing) {
          Object.assign(existing, payload);
          output.push(existing);
        } else {
          const inserted = { id: payload.id ?? `${this.table}-${table.length + 1}`, ...payload };
          table.push(inserted);
          output.push(inserted);
        }
      }
      return { data: output, error: null };
    }

    if (this.operation === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }

    if (this.operation === "delete") {
      this.client.rows[this.table] = table.filter((row) => !this.matches(row));
      return { data: matched, error: null };
    }

    return { data: matched, error: null };
  }

  private payloads(): Row[] {
    return Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }
}

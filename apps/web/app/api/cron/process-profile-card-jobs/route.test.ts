import { afterEach, describe, expect, test, vi } from "vitest";

import type { QueryLike, SupabaseLike } from "@soulsync/core/src/jobs/pipeline";
import type { PersonaSpec } from "@soulsync/core/src/types";
import { GET } from "./route";
import { processProfileCardJobs } from "./worker";

const APP_USER_ID = "91000000-0000-0000-0000-000000000001";
const PROFILE_ID = "92000000-0000-0000-0000-000000000001";
const UPDATED_AT = "2026-05-31T00:00:00.000Z";
const NOW = "2026-05-31T12:00:00.000Z";

describe("process-profile-card-jobs cron route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("rejects requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const response = await GET(new Request("http://localhost/api/cron/process-profile-card-jobs"));

    expect(response.status).toBe(401);
  });

  test("processes a queued profile card job and writes a ready card", async () => {
    const client = seedClient();
    const jobId = client.insertJob(APP_USER_ID);

    const summary = await processProfileCardJobs({ client });

    const job = client.rows.profile_card_jobs.find((row) => row.id === jobId);
    const cards = client.rows.profile_cards;

    expect(summary).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(job).toMatchObject({ status: "succeeded", progress: 100 });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      app_user_id: APP_USER_ID,
      style: "default",
      generator_version: "ggui-card-v1",
      profile_version: `${PROFILE_ID}:${UPDATED_AT}`,
      status: "ready",
      is_synthetic: true,
    });
    expect(cards[0]?.html).toContain('class="ggui-card"');
    expect(cards[0]?.css).toContain(".ggui-card");
    expect(cards[0]?.placeholders).toEqual(["slot-1", "slot-2", "slot-3"]);
  });
});

const seedClient = (): FakeProfileCardWorkerSupabase => {
  const client = new FakeProfileCardWorkerSupabase();

  client.rows.profiles.push(profileRow());
  client.rows.photos.push(approvedPhoto("photo-3", "z-last.jpg", false));
  client.rows.photos.push(approvedPhoto("photo-1", "a-primary.jpg", true));
  client.rows.photos.push(approvedPhoto("photo-2", "m-second.jpg", false));
  client.rows.photos.push(approvedPhoto("photo-4", "overflow.jpg", false));

  return client;
};

const profileRow = (): StoredRow => ({
  id: PROFILE_ID,
  app_user_id: APP_USER_ID,
  city: "Seoul",
  district: "Gangnam-gu",
  mbti: "ENFP",
  religion_type: "Christian",
  religion_intensity: 3,
  values: {
    religion: { type: "Christian", intensity: 3 },
    familyValues: ["kindness"],
    lifePriorities: ["growth"],
    dealbreakers: ["dishonesty"],
  },
  visibility: "discoverable",
  is_synthetic: true,
  salary_band: "private salary",
  profile_text: "Profile card worker test intro",
  persona_spec: persona(),
  updated_at: UPDATED_AT,
});

const persona = (): PersonaSpec => ({
  id: PROFILE_ID,
  displayName: "Profile Card Worker Tester",
  ageRange: "30s",
  city: "Seoul",
  district: "Gangnam-gu",
  mbti: "ENFP",
  values: {
    familyValues: ["kindness"],
    lifePriorities: ["growth"],
    dealbreakers: ["dishonesty"],
  },
  interests: ["coffee", "hiking"],
  boundaries: ["No private details"],
  is_synthetic: true,
});

const approvedPhoto = (id: string, path: string, isPrimary: boolean): StoredRow => ({
  id,
  app_user_id: APP_USER_ID,
  bucket: "profile-private",
  path,
  moderation_status: "approved",
  is_primary: isPrimary,
});

type TableName = "profiles" | "photos" | "profile_cards" | "profile_card_jobs";
type StoredRow = Record<string, unknown>;

class FakeProfileCardWorkerSupabase implements SupabaseLike {
  rows: Record<TableName, StoredRow[]> = {
    profiles: [],
    photos: [],
    profile_cards: [],
    profile_card_jobs: [],
  };

  from<T = StoredRow>(table: string): QueryLike<T> {
    if (!isTableName(table)) {
      throw new Error(`Unexpected table ${table}`);
    }

    return new FakeProfileCardWorkerQuery<T>(this, table);
  }

  async rpc<T = StoredRow>(): Promise<{ data: T[]; error: null }> {
    return { data: [], error: null };
  }

  insertJob(appUserId: string): string {
    const id = `profile-card-job-${this.rows.profile_card_jobs.length + 1}`;
    this.rows.profile_card_jobs.push({ id, app_user_id: appUserId, status: "queued", progress: 0, created_at: NOW, updated_at: NOW });

    return id;
  }
}

class FakeProfileCardWorkerQuery<T = StoredRow> implements QueryLike<T> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "upsert" | "update" = "select";
  private payload: StoredRow | StoredRow[] | null = null;
  private conflictColumns: string[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount = Number.POSITIVE_INFINITY;

  constructor(private readonly client: FakeProfileCardWorkerSupabase, private readonly table: TableName) {}

  select(): QueryLike<T> {
    if (!this.payload) {
      this.operation = "select";
    }

    return this;
  }

  eq(column: string, value: unknown): QueryLike<T> {
    this.filters.push([column, value]);

    return this;
  }

  insert(payload: StoredRow | StoredRow[]): QueryLike<T> {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  upsert(payload: StoredRow | StoredRow[], options?: Record<string, unknown>): QueryLike<T> {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictColumns = typeof options?.onConflict === "string" ? options.onConflict.split(",") : [];

    return this;
  }

  update(payload: StoredRow): QueryLike<T> {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  order(column: string, options?: Record<string, unknown>): QueryLike<T> {
    this.orderBy = { column, ascending: options?.ascending !== false };

    return this;
  }

  limit(count: number): QueryLike<T> {
    this.limitCount = count;

    return this;
  }

  async single(): Promise<{ data: T | null; error: Error | null }> {
    const result = await this.executeTyped();
    const row = result.data[0];

    return { data: row ?? null, error: row ? null : new Error("not found") };
  }

  async maybeSingle(): Promise<{ data: T | null; error: null }> {
    const result = await this.executeTyped();

    return { data: result.data[0] ?? null, error: null };
  }

  then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.executeTyped().then(onfulfilled, onrejected);
  }

  private async executeTyped(): Promise<{ data: T[]; error: null }> {
    const result = await this.execute();

    return { data: result.data as T[], error: null };
  }

  private async execute(): Promise<{ data: StoredRow[]; error: null }> {
    const table = this.client.rows[this.table];
    const matched = this.sorted(table.filter((row) => this.matches(row)));

    if (this.operation === "insert") {
      const inserted = this.payloads().map((payload) => ({ id: payload.id ?? this.nextId(table.length + 1), ...payload }));
      table.push(...inserted);

      return { data: inserted, error: null };
    }

    if (this.operation === "upsert") {
      const written: StoredRow[] = [];

      for (const payload of this.payloads()) {
        const existing = table.find((row) => this.conflicts(row, payload));

        if (existing) {
          Object.assign(existing, payload);
          written.push(existing);
        } else {
          const inserted = { id: payload.id ?? this.nextId(table.length + 1), ...payload };
          table.push(inserted);
          written.push(inserted);
        }
      }

      return { data: written, error: null };
    }

    if (this.operation === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));

      return { data: matched.slice(0, this.limitCount), error: null };
    }

    return { data: matched.slice(0, this.limitCount), error: null };
  }

  private payloads(): StoredRow[] {
    if (Array.isArray(this.payload)) {
      return this.payload;
    }

    return [this.payload ?? {}];
  }

  private sorted(rows: StoredRow[]): StoredRow[] {
    if (!this.orderBy) {
      return rows;
    }

    return [...rows].sort((left, right) => compareValues(left[this.orderBy?.column ?? ""], right[this.orderBy?.column ?? ""], this.orderBy?.ascending !== false));
  }

  private matches(row: StoredRow): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  private conflicts(row: StoredRow, payload: StoredRow): boolean {
    return this.conflictColumns.length > 0 && this.conflictColumns.every((column) => row[column] === payload[column]);
  }

  private nextId(sequence: number): string {
    return `${this.table}-${sequence}`;
  }
}

const compareValues = (left: unknown, right: unknown, ascending: boolean): number => {
  const leftValue = typeof left === "boolean" ? Number(left) : String(left ?? "");
  const rightValue = typeof right === "boolean" ? Number(right) : String(right ?? "");
  const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;

  return ascending ? comparison : -comparison;
};

const isTableName = (table: string): table is TableName => ["profiles", "photos", "profile_cards", "profile_card_jobs"].includes(table);

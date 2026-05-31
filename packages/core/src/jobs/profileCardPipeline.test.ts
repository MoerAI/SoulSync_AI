import { describe, expect, test } from "vitest";

import { MockGgui, type CardGenInput, type GguiLike } from "../cardgen";
import type { PersonaSpec } from "../types";
import type { QueryLike, SupabaseLike } from "./pipeline";
import { runProfileCardJob } from "./profileCardPipeline";

const APP_USER_ID = "91000000-0000-0000-0000-000000000001";
const PROFILE_ID = "92000000-0000-0000-0000-000000000001";
const UPDATED_AT = "2026-05-31T00:00:00.000Z";
const NOW = "2026-05-31T12:00:00.000Z";

describe("runProfileCardJob", () => {
  test("generates one ready profile card and succeeds the job", async () => {
    const client = seedClient();
    const jobId = client.insertJob(APP_USER_ID);
    const ggui = new CapturingGgui();

    const result = await runProfileCardJob(jobId, { client, ggui, now });

    const job = client.rows.profile_card_jobs.find((row) => row.id === jobId);
    const cards = client.rows.profile_cards;

    expect(result).toEqual({ jobId, status: "succeeded", cardWritten: true });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      app_user_id: APP_USER_ID,
      style: "default",
      generator_version: "ggui-card-v1",
      profile_version: `${PROFILE_ID}:${UPDATED_AT}`,
      status: "ready",
      is_synthetic: true,
      updated_at: NOW,
    });
    expect(cards[0]?.html).toContain('class="ggui-card"');
    expect(cards[0]?.css).toContain(".ggui-card");
    expect(cards[0]?.placeholders).toEqual(["slot-1", "slot-2", "slot-3"]);
    expect(String(cards[0]?.photo_fingerprint)).not.toContain("signed");
    expect(job).toMatchObject({ status: "succeeded", progress: 100, updated_at: NOW });
    expect(ggui.inputs).toHaveLength(1);
    expect(ggui.inputs[0]?.displayName).toBe("Profile Card Tester");
    expect(ggui.inputs[0]?.photoSlots).toEqual(["slot-1", "slot-2", "slot-3"]);
  });

  test("upserts repeated runs for the same profile card version without duplicating rows", async () => {
    const client = seedClient();
    const firstJobId = client.insertJob(APP_USER_ID);
    const secondJobId = client.insertJob(APP_USER_ID);

    const first = await runProfileCardJob(firstJobId, { client, ggui: new CapturingGgui(), now });
    const firstFingerprint = client.rows.profile_cards[0]?.photo_fingerprint;
    const second = await runProfileCardJob(secondJobId, { client, ggui: new CapturingGgui(), now });

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
    expect(client.rows.profile_cards).toHaveLength(1);
    expect(client.rows.profile_cards[0]?.photo_fingerprint).toBe(firstFingerprint);
    expect(client.rows.profile_card_jobs.find((row) => row.id === firstJobId)?.status).toBe("succeeded");
    expect(client.rows.profile_card_jobs.find((row) => row.id === secondJobId)?.status).toBe("succeeded");
  });

  test("marks the job failed and records the generator error", async () => {
    const client = seedClient();
    const jobId = client.insertJob(APP_USER_ID);
    const ggui: GguiLike = {
      async generateCard() {
        throw new Error("ggui unavailable");
      },
    };

    const result = await runProfileCardJob(jobId, { client, ggui, now });

    const job = client.rows.profile_card_jobs.find((row) => row.id === jobId);

    expect(result).toEqual({ jobId, status: "failed", cardWritten: false });
    expect(client.rows.profile_cards).toHaveLength(0);
    expect(job).toMatchObject({ status: "failed", error: "ggui unavailable", updated_at: NOW });
  });

  test("returns cancelled without writing when the job was already cancelled", async () => {
    const client = seedClient();
    const jobId = client.insertJob(APP_USER_ID, "cancelled");
    const ggui = new CapturingGgui();

    const result = await runProfileCardJob(jobId, { client, ggui, now });

    const job = client.rows.profile_card_jobs.find((row) => row.id === jobId);

    expect(result).toEqual({ jobId, status: "cancelled", cardWritten: false });
    expect(client.rows.profile_cards).toHaveLength(0);
    expect(job).toMatchObject({ status: "cancelled", progress: 0 });
    expect(ggui.inputs).toHaveLength(0);
  });
});

class CapturingGgui extends MockGgui {
  readonly inputs: CardGenInput[] = [];

  async generateCard(input: CardGenInput) {
    this.inputs.push(input);

    return super.generateCard(input);
  }
}

const seedClient = (): FakeSupabase => {
  const client = new FakeSupabase();

  client.rows.profiles.push(profileRow());
  client.rows.photos.push(approvedPhoto("photo-3", "z-last.jpg", false));
  client.rows.photos.push(approvedPhoto("photo-1", "a-primary.jpg", true));
  client.rows.photos.push(approvedPhoto("photo-2", "m-second.jpg", false));
  client.rows.photos.push(approvedPhoto("photo-4", "overflow.jpg", false));
  client.rows.photos.push({ id: "pending-photo", app_user_id: APP_USER_ID, bucket: "profile-private", path: "pending.jpg", moderation_status: "pending", is_primary: false });
  client.rows.photos.push({ id: "other-bucket-photo", app_user_id: APP_USER_ID, bucket: "other", path: "other.jpg", moderation_status: "approved", is_primary: true });

  return client;
};

const profileRow = (): Record<string, unknown> => ({
  id: PROFILE_ID,
  app_user_id: APP_USER_ID,
  city: "Seoul",
  district: "Gangnam-gu",
  mbti: "ENFP",
  religion_type: "기독교",
  religion_intensity: 3,
  values: {
    religion: { type: "기독교", intensity: 3 },
    familyValues: ["kindness"],
    lifePriorities: ["growth"],
    dealbreakers: ["dishonesty"],
  },
  visibility: "discoverable",
  is_synthetic: true,
  salary_band: "private salary",
  profile_text: "Profile card test intro",
  persona_spec: persona(),
  updated_at: UPDATED_AT,
});

const persona = (): PersonaSpec => ({
  id: PROFILE_ID,
  displayName: "Profile Card Tester",
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

const approvedPhoto = (id: string, path: string, isPrimary: boolean): Record<string, unknown> => ({
  id,
  app_user_id: APP_USER_ID,
  bucket: "profile-private",
  path,
  moderation_status: "approved",
  is_primary: isPrimary,
});

class FakeSupabase implements SupabaseLike {
  rows: Record<string, Record<string, unknown>[]> = {
    profiles: [],
    photos: [],
    profile_cards: [],
    profile_card_jobs: [],
  };

  from<T = Record<string, unknown>>(table: string): QueryLike<T> {
    return new FakeQuery<T>(this, table);
  }

  async rpc<T = Record<string, unknown>>(): Promise<{ data: T[]; error: null }> {
    return { data: [], error: null };
  }

  insertJob(appUserId: string, status = "queued"): string {
    const id = `job-${this.rows.profile_card_jobs.length + 1}`;
    this.rows.profile_card_jobs.push({ id, app_user_id: appUserId, status, progress: 0, created_at: NOW, updated_at: NOW });

    return id;
  }
}

class FakeQuery<T = Record<string, unknown>> implements QueryLike<T> {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "upsert" | "update" = "select";
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private conflictColumns: string[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(private readonly client: FakeSupabase, private readonly table: string) {}

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

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): QueryLike<T> {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options?: Record<string, unknown>): QueryLike<T> {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictColumns = typeof options?.onConflict === "string" ? options.onConflict.split(",") : [];

    return this;
  }

  update(payload: Record<string, unknown>): QueryLike<T> {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  order(column: string, options?: Record<string, unknown>): QueryLike<T> {
    this.orderBy = { column, ascending: options?.ascending !== false };

    return this;
  }

  limit(): QueryLike<T> {
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

    return { data: result.data.map((row) => row as T), error: null };
  }

  private async execute(): Promise<{ data: Record<string, unknown>[]; error: null }> {
    const table = this.client.rows[this.table];
    const matched = this.sorted(table.filter((row) => this.matches(row)));

    if (this.operation === "insert") {
      const inserted = this.payloads().map((payload) => ({ id: payload.id ?? this.nextId(table.length + 1), ...payload }));
      table.push(...inserted);

      return { data: inserted, error: null };
    }

    if (this.operation === "upsert") {
      const written: Record<string, unknown>[] = [];

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

      return { data: matched, error: null };
    }

    return { data: matched, error: null };
  }

  private payloads(): Record<string, unknown>[] {
    if (Array.isArray(this.payload)) {
      return this.payload;
    }

    return [this.payload ?? {}];
  }

  private sorted(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.orderBy) {
      return rows;
    }

    return [...rows].sort((left, right) => {
      const leftValue = Number(Boolean(left[this.orderBy?.column ?? ""]));
      const rightValue = Number(Boolean(right[this.orderBy?.column ?? ""]));

      return this.orderBy?.ascending === false ? rightValue - leftValue : leftValue - rightValue;
    });
  }

  private matches(row: Record<string, unknown>): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  private conflicts(row: Record<string, unknown>, payload: Record<string, unknown>): boolean {
    return this.conflictColumns.length > 0 && this.conflictColumns.every((column) => row[column] === payload[column]);
  }

  private nextId(sequence: number): string {
    return `${this.table}-${sequence}`;
  }
}

const now = (): Date => new Date(NOW);

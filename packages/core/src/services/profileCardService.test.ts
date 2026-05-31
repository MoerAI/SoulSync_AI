import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

import { enqueueProfileCardGeneration, getProfileCard, getProfileCardForViewer, getProfileCardForViewerEnsured } from "./profileCardService";
import type { CoreServiceContext } from "./types";

type StoredRow = Record<string, unknown>;
type TableName = "photos" | "profile_card_jobs" | "profile_cards" | "profiles" | "recommendations";
type Filter = { column: string; value: unknown } | { column: string; values: Set<unknown> };
type Ordering = { column: string; ascending: boolean };
type QueryResult<T> = { data: T | null; error: Error | null };
type QueryRowsResult = { data: StoredRow[]; error: null };

const UPDATED_AT = "2026-05-31T00:00:00.000Z";

describe("profileCardService", () => {
  test("getProfileCardForViewer returns no card or photos when the candidate is not recommended to the actor", async () => {
    const { context } = contextWithRows({
      profile_cards: [cardRow({ appUserId: "candidate", placeholders: ["slot-1"] })],
    });

    await expect(getProfileCardForViewer({ candidateId: "candidate" }, context)).resolves.toEqual({ card: null, photos: {} });
  });

  test("getProfileCardForViewer returns a recommended candidate card with signed photos zipped onto placeholders", async () => {
    const { context } = contextWithRows({
      photos: [photoRow("photo-1", "candidate", "candidate/primary.jpg", true), photoRow("photo-2", "candidate", "candidate/second.jpg", false)],
      profile_cards: [cardRow({ appUserId: "candidate", placeholders: ["slot-1", "slot-2"], createdAt: "2026-05-31T00:01:00.000Z" })],
      recommendations: [{ id: "recommendation-1", app_user_id: "actor", candidate_id: "candidate" }],
    });

    await expect(getProfileCardForViewer({ candidateId: "candidate" }, context)).resolves.toEqual({
      card: {
        version: "profile-v1",
        generatorVersion: "generator-v1",
        html: "<section>candidate card</section>",
        css: ".card { color: #111; }",
        placeholders: ["slot-1", "slot-2"],
        is_synthetic: false,
      },
      photos: {
        "slot-1": "https://signed.example/candidate/primary.jpg",
        "slot-2": "https://signed.example/candidate/second.jpg",
      },
    });
  });

  test("getProfileCard returns the actor's own latest card", async () => {
    const { context } = contextWithRows({
      profile_cards: [
        cardRow({ appUserId: "actor", html: "<section>old</section>", createdAt: "2026-05-30T00:00:00.000Z" }),
        cardRow({ appUserId: "actor", html: "<section>latest</section>", placeholders: ["slot-1"], createdAt: "2026-05-31T00:00:00.000Z" }),
        cardRow({ appUserId: "other", html: "<section>other</section>", createdAt: "2026-06-01T00:00:00.000Z" }),
      ],
    });

    await expect(getProfileCard(context)).resolves.toEqual({
      version: "profile-v1",
      generatorVersion: "generator-v1",
      html: "<section>latest</section>",
      css: ".card { color: #111; }",
      placeholders: ["slot-1"],
      is_synthetic: false,
    });
  });

  test("enqueueProfileCardGeneration is idempotent while a queued job exists", async () => {
    const { client, context } = contextWithRows();

    const first = await enqueueProfileCardGeneration("actor", context);
    const second = await enqueueProfileCardGeneration("actor", context);

    expect(first).toEqual({ enqueued: true, jobId: "profile_card_jobs-1" });
    expect(second).toEqual({ enqueued: false });
    expect(client.rows.profile_card_jobs).toEqual([{ id: "profile_card_jobs-1", app_user_id: "actor", status: "queued" }]);
  });

  test("getProfileCardForViewerEnsured generates and returns a missing actor card when enabled", async () => {
    const { client, context } = contextWithRows({
      photos: [photoRow("photo-1", "actor", "actor/primary.jpg", true)],
      profiles: [profileRow("actor")],
    });

    const result = await getProfileCardForViewerEnsured({}, context, { generate: true });

    expect(result.card).toMatchObject({
      version: `profile-actor:${UPDATED_AT}`,
      generatorVersion: "ggui-card-v1",
      placeholders: ["slot-1"],
      is_synthetic: true,
    });
    expect(result.card?.html).toContain("Profile Card Tester");
    expect(result.photos).toEqual({ "slot-1": "https://signed.example/actor/primary.jpg" });
    expect(client.rows.profile_cards).toHaveLength(1);
    expect(client.rows.profile_card_jobs).toEqual([expect.objectContaining({ app_user_id: "actor", status: "succeeded", progress: 100 })]);
  });

  test("getProfileCardForViewerEnsured does not generate a missing card when disabled", async () => {
    const { client, context } = contextWithRows({ profiles: [profileRow("actor")] });

    await expect(getProfileCardForViewerEnsured({}, context, { generate: false })).resolves.toEqual({ card: null, photos: {} });
    expect(client.rows.profile_cards).toHaveLength(0);
    expect(client.rows.profile_card_jobs).toHaveLength(0);
  });
});

const contextWithRows = (rows: Partial<Record<TableName, StoredRow[]>> = {}): { client: FakeProfileCardClient; context: CoreServiceContext } => {
  const client = new FakeProfileCardClient(rows);

  return {
    client,
    context: {
      client: client as unknown as SupabaseClient,
      actor: { source: "mcp", appUserId: "actor", scopes: [] },
    },
  };
};

const cardRow = ({
  appUserId,
  html = "<section>candidate card</section>",
  css = ".card { color: #111; }",
  placeholders = [],
  createdAt = "2026-05-31T00:00:00.000Z",
}: {
  appUserId: string;
  html?: string;
  css?: string;
  placeholders?: string[];
  createdAt?: string;
}): StoredRow => ({
  id: `card-${appUserId}-${createdAt}`,
  app_user_id: appUserId,
  html,
  css,
  placeholders,
  profile_version: "profile-v1",
  generator_version: "generator-v1",
  is_synthetic: false,
  created_at: createdAt,
});

const photoRow = (id: string, appUserId: string, path: string, isPrimary: boolean): StoredRow => ({
  id,
  app_user_id: appUserId,
  bucket: "profile-private",
  path,
  moderation_status: "approved",
  is_primary: isPrimary,
});

const profileRow = (appUserId: string): StoredRow => ({
  id: `profile-${appUserId}`,
  app_user_id: appUserId,
  city: "Seoul",
  district: "Gangnam-gu",
  mbti: "ENFP",
  religion_type: "기독교",
  religion_intensity: 3,
  values: { familyValues: ["kindness"], lifePriorities: ["growth"], dealbreakers: ["dishonesty"] },
  visibility: "discoverable",
  is_synthetic: true,
  salary_band: "private salary",
  profile_text: "Profile card service test intro",
  persona_spec: {
    id: `profile-${appUserId}`,
    displayName: "Profile Card Tester",
    ageRange: "30s",
    city: "Seoul",
    district: "Gangnam-gu",
    mbti: "ENFP",
    values: { familyValues: ["kindness"], lifePriorities: ["growth"], dealbreakers: ["dishonesty"] },
    interests: ["coffee", "hiking"],
    boundaries: ["No private details"],
    is_synthetic: true,
  },
  updated_at: UPDATED_AT,
});

class FakeProfileCardClient {
  readonly rows: Record<TableName, StoredRow[]>;
  readonly storage = new FakeStorage();

  constructor(rows: Partial<Record<TableName, StoredRow[]>>) {
    this.rows = {
      photos: [...(rows.photos ?? [])],
      profile_card_jobs: [...(rows.profile_card_jobs ?? [])],
      profile_cards: [...(rows.profile_cards ?? [])],
      profiles: [...(rows.profiles ?? [])],
      recommendations: [...(rows.recommendations ?? [])],
    };
  }

  from(table: string): FakeQuery {
    if (!isTableName(table)) {
      throw new Error(`Unexpected table ${table}`);
    }

    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private operation: "insert" | "select" | "update" | "upsert" = "select";
  private orderings: Ordering[] = [];
  private payload: StoredRow | StoredRow[] | null = null;
  private conflictColumns: string[] = [];

  constructor(private readonly client: FakeProfileCardClient, private readonly table: TableName) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });

    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, values: new Set(values) });

    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.orderings.push({ column, ascending: options.ascending });

    return this;
  }

  limit(count: number): this {
    this.limitCount = count;

    return this;
  }

  insert(payload: StoredRow | StoredRow[]): this {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  update(payload: StoredRow): this {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  upsert(payload: StoredRow | StoredRow[], options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictColumns = options?.onConflict?.split(",") ?? [];

    return this;
  }

  async maybeSingle<Row>(): Promise<QueryResult<Row>> {
    const rows = await this.execute();

    return { data: (rows[0] as unknown as Row) ?? null, error: null };
  }

  async single<Row>(): Promise<QueryResult<Row>> {
    const rows = await this.execute();
    const row = rows[0];

    return row ? { data: row as unknown as Row, error: null } : { data: null, error: new Error("not found") };
  }

  async returns<Rows>(): Promise<{ data: Rows | null; error: Error | null }> {
    const rows = await this.execute();

    return { data: rows as unknown as Rows, error: null };
  }

  then<TResult1 = QueryRowsResult, TResult2 = never>(
    onfulfilled?: ((value: QueryRowsResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.executeRows().then(onfulfilled, onrejected);
  }

  private async executeRows(): Promise<QueryRowsResult> {
    return { data: await this.execute(), error: null };
  }

  private async execute(): Promise<StoredRow[]> {
    let rows = this.client.rows[this.table].filter((row) => this.matches(row));

    if (this.operation === "insert") {
      const table = this.client.rows[this.table];
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = payloads.map((payload, index) => ({ id: payload.id ?? `${this.table}-${table.length + index + 1}`, ...payload }));
      table.push(...inserted);

      return inserted;
    }

    if (this.operation === "update") {
      rows.forEach((row) => Object.assign(row, this.payload ?? {}));

      return rows;
    }

    if (this.operation === "upsert") {
      const table = this.client.rows[this.table];
      const written: StoredRow[] = [];

      for (const payload of Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]) {
        const existing = table.find((row) => this.conflictColumns.length > 0 && this.conflictColumns.every((column) => row[column] === payload[column]));
        if (existing) {
          Object.assign(existing, payload);
          written.push(existing);
        } else {
          const inserted = { id: payload.id ?? `${this.table}-${table.length + 1}`, ...payload };
          table.push(inserted);
          written.push(inserted);
        }
      }

      return written;
    }

    for (const ordering of this.orderings) {
      rows = [...rows].sort((left, right) => compareValues(left[ordering.column], right[ordering.column], ordering.ascending));
    }

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }

  private matches(row: StoredRow): boolean {
    return this.filters.every((filter) => {
      if ("values" in filter) {
        return filter.values.has(row[filter.column]);
      }

      return row[filter.column] === filter.value;
    });
  }
}

class FakeStorage {
  from(bucket: string): FakeBucket {
    return new FakeBucket(bucket);
  }
}

class FakeBucket {
  constructor(private readonly bucket: string) {}

  async createSignedUrl(path: string): Promise<{ data: { signedUrl: string }; error: null }> {
    if (this.bucket !== "profile-private") {
      throw new Error(`Unexpected bucket ${this.bucket}`);
    }

    return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
  }
}

const isTableName = (table: string): table is TableName => ["photos", "profile_card_jobs", "profile_cards", "profiles", "recommendations"].includes(table);

const compareValues = (left: unknown, right: unknown, ascending: boolean): number => {
  const leftValue = typeof left === "boolean" ? Number(left) : String(left ?? "");
  const rightValue = typeof right === "boolean" ? Number(right) : String(right ?? "");
  const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;

  return ascending ? comparison : -comparison;
};

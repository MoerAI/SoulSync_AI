import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PersonaPreview } from "../persona";
import type { PhotoClassifier } from "../safety/moderation";
import { uploadProfilePhoto } from "./photoService";
import { generatePersonaForActor } from "./personaService";
import type { CoreServiceContext } from "./types";

const personaMockState = vi.hoisted(() => {
  const persona = {
    id: "profile-1",
    displayName: "Test Persona",
    interests: ["hiking"],
    boundaries: ["No salary details."],
    is_synthetic: false,
    allowedTalkingPoints: ["hiking"],
    forbiddenTopics: ["salary"],
  } satisfies PersonaPreview;

  return {
    persona,
    generatePersona: vi.fn(async () => persona),
  };
});

vi.mock("../persona", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../persona")>();

  return {
    ...actual,
    generatePersona: personaMockState.generatePersona,
  };
});

type StoredRow = Record<string, unknown>;
type TableName = "profiles" | "profile_answers" | "photos" | "profile_card_jobs";
type Filter = { column: string; value: unknown } | { column: string; values: Set<unknown> };
type QueryResult<T> = { data: T | null; error: Error | null };

describe("profile readiness profile-card enqueueing", () => {
  beforeEach(() => {
    personaMockState.generatePersona.mockClear();
    personaMockState.generatePersona.mockResolvedValue(personaMockState.persona);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("generatePersonaForActor enqueues a profile card job after saving the persona", async () => {
    const { client, context } = contextWithRows();

    await expect(generatePersonaForActor(undefined, context)).resolves.toEqual(personaMockState.persona);

    expect(client.rows.profile_card_jobs).toEqual([{ id: "profile_card_jobs-1", app_user_id: "actor", status: "queued" }]);
    expect(client.events.filter((event) => event === "profiles:update" || event === "profile_card_jobs:insert")).toEqual(["profiles:update", "profile_card_jobs:insert"]);
  });

  test("generatePersonaForActor returns the persona when profile card enqueueing fails", async () => {
    const { client, context } = contextWithRows();
    const enqueueError = new Error("profile card queue unavailable");
    client.profileCardJobsError = enqueueError;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(generatePersonaForActor(undefined, context)).resolves.toEqual(personaMockState.persona);

    expect(warn).toHaveBeenCalledWith("profile card enqueue failed", expect.any(Error));
  });

  test("uploadProfilePhoto enqueues a profile card job after an approved photo is stored", async () => {
    const { client, context } = contextWithRows();

    await expect(
      uploadProfilePhoto(
        {
          fileName: "face.jpg",
          source: { buffer: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
          classifier: approvedPhotoClassifier,
        },
        context,
      ),
    ).resolves.toEqual({ photoId: "photos-1", status: "approved" });

    expect(client.rows.profile_card_jobs).toEqual([{ id: "profile_card_jobs-1", app_user_id: "actor", status: "queued" }]);
    expect(client.events.filter((event) => event === "photos:insert" || event === "profile_card_jobs:insert")).toEqual(["photos:insert", "profile_card_jobs:insert"]);
  });
});

const approvedPhotoClassifier: PhotoClassifier = {
  async classify() {
    return { nsfw: false, apparentMinor: false };
  },
};

const contextWithRows = (rows: Partial<Record<TableName, StoredRow[]>> = {}): { client: FakeReadyClient; context: CoreServiceContext } => {
  const client = new FakeReadyClient(rows);

  return {
    client,
    context: {
      client: client as unknown as SupabaseClient,
      actor: { source: "mcp", appUserId: "actor", scopes: [] },
    },
  };
};

class FakeReadyClient {
  readonly rows: Record<TableName, StoredRow[]>;
  readonly events: string[] = [];
  readonly storage = new FakeReadyStorage(this);
  profileCardJobsError: Error | null = null;

  constructor(rows: Partial<Record<TableName, StoredRow[]>>) {
    this.rows = {
      profiles: [profileRow(), ...(rows.profiles ?? [])],
      profile_answers: [...(rows.profile_answers ?? [])],
      photos: [...(rows.photos ?? [])],
      profile_card_jobs: [...(rows.profile_card_jobs ?? [])],
    };
  }

  from(table: string): FakeReadyQuery {
    if (!isTableName(table)) {
      throw new Error(`Unexpected table ${table}`);
    }

    return new FakeReadyQuery(this, table);
  }
}

class FakeReadyQuery {
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private operation: "insert" | "select" | "update" = "select";
  private payload: StoredRow | StoredRow[] | null = null;

  constructor(private readonly client: FakeReadyClient, private readonly table: TableName) {}

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

  async maybeSingle<Row>(): Promise<QueryResult<Row>> {
    const result = await this.executeQuery();
    if (result.error) {
      return { data: null, error: result.error };
    }

    const rows = result.data ?? [];

    return { data: (rows[0] as unknown as Row) ?? null, error: null };
  }

  async single<Row>(): Promise<QueryResult<Row>> {
    const result = await this.executeQuery();
    if (result.error) {
      return { data: null, error: result.error };
    }

    const row = result.data?.[0];

    return row ? { data: row as unknown as Row, error: null } : { data: null, error: new Error("not found") };
  }

  async returns<Rows>(): Promise<{ data: Rows | null; error: Error | null }> {
    const result = await this.executeQuery();
    if (result.error) {
      return { data: null, error: result.error };
    }

    return { data: (result.data ?? []) as unknown as Rows, error: null };
  }

  then<TResult1 = QueryResult<StoredRow[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<StoredRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executeQuery().then(onfulfilled, onrejected);
  }

  private async executeQuery(): Promise<QueryResult<StoredRow[]>> {
    if (this.table === "profile_card_jobs" && this.operation === "select" && this.client.profileCardJobsError) {
      return { data: null, error: this.client.profileCardJobsError };
    }

    return { data: this.executeRows(), error: null };
  }

  private executeRows(): StoredRow[] {
    if (this.operation === "insert") {
      const table = this.client.rows[this.table];
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = payloads.map((payload, index) => ({ id: payload.id ?? `${this.table}-${table.length + index + 1}`, ...payload }));
      table.push(...inserted);
      this.client.events.push(`${this.table}:insert`);

      return inserted;
    }

    if (this.operation === "update") {
      const payload = Array.isArray(this.payload) ? this.payload[0] ?? {} : this.payload ?? {};
      const matched = this.client.rows[this.table].filter((row) => this.matches(row));
      for (const row of matched) {
        Object.assign(row, payload);
      }
      this.client.events.push(`${this.table}:update`);

      return matched;
    }

    const rows = this.client.rows[this.table].filter((row) => this.matches(row));

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

class FakeReadyStorage {
  constructor(private readonly client: FakeReadyClient) {}

  from(bucket: string): FakeReadyBucket {
    return new FakeReadyBucket(this.client, bucket);
  }
}

class FakeReadyBucket {
  constructor(private readonly client: FakeReadyClient, private readonly bucket: string) {}

  async upload(path: string, buffer: Uint8Array, options: { contentType?: string; upsert?: boolean }): Promise<{ data: { path: string }; error: null }> {
    if (this.bucket !== "profile-private") {
      throw new Error(`Unexpected bucket ${this.bucket}`);
    }

    this.client.events.push("storage:upload");

    return { data: { path: `${buffer.byteLength}:${options.contentType ?? ""}:${path}` }, error: null };
  }
}

const profileRow = (): StoredRow => ({
  id: "profile-1",
  app_user_id: "actor",
  visibility: "discoverable",
  is_synthetic: false,
  city: "Seoul",
  district: "Mapo",
  salary_band: null,
  profile_text: null,
});

const tableNames = new Set<string>(["profiles", "profile_answers", "photos", "profile_card_jobs"]);
const isTableName = (table: string): table is TableName => tableNames.has(table);

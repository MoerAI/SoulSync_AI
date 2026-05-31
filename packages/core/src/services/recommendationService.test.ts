import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

import { signedDisplayablePhotosByCandidate } from "./recommendationService";
import type { CoreServiceContext } from "./types";

type PhotoFixture = {
  id: string;
  app_user_id: string;
  bucket: string;
  path: string;
  moderation_status: string | null;
  is_primary: boolean | null;
};

type QueryTrace = {
  table: string;
  selectedColumns?: string;
  inFilters: Array<{ column: string; values: unknown[] }>;
  eqFilters: Array<{ column: string; value: unknown }>;
  orderings: Array<{ column: string; options: { ascending: boolean } }>;
};

type SignedUrlRequest = {
  bucket: string;
  path: string;
  expiresIn: number;
};

describe("signedDisplayablePhotosByCandidate", () => {
  test("returns up to three approved signed URLs per candidate with primary photos first", async () => {
    const { client, context } = contextWithPhotos([
      photo("a-primary", "candidate-a", "a-primary.jpg", "approved", true),
      photo("a-pending", "candidate-a", "a-pending.jpg", "pending", false),
      photo("a-approved-1", "candidate-a", "a-approved-1.jpg", "approved", false),
      photo("a-approved-2", "candidate-a", "a-approved-2.jpg", "approved", false),
    ]);

    const signed = await signedDisplayablePhotosByCandidate(["candidate-a"], context);

    expect(signed.get("candidate-a")).toEqual([signedUrl("a-primary.jpg"), signedUrl("a-approved-1.jpg"), signedUrl("a-approved-2.jpg")]);
    expect(client.queries).toEqual([
      {
        table: "photos",
        selectedColumns: "id, app_user_id, bucket, path, moderation_status, is_primary",
        inFilters: [{ column: "app_user_id", values: ["candidate-a"] }],
        eqFilters: [{ column: "bucket", value: "profile-private" }],
        orderings: [{ column: "is_primary", options: { ascending: false } }],
      },
    ]);
    expect(client.storage.requests).toEqual([
      { bucket: "profile-private", path: "a-primary.jpg", expiresIn: 60 * 10 },
      { bucket: "profile-private", path: "a-approved-1.jpg", expiresIn: 60 * 10 },
      { bucket: "profile-private", path: "a-approved-2.jpg", expiresIn: 60 * 10 },
    ]);
  });

  test("caps each candidate at the supplied limit", async () => {
    const { context } = contextWithPhotos([
      photo("b-approved-1", "candidate-b", "b-approved-1.jpg", "approved", false),
      photo("b-primary", "candidate-b", "b-primary.jpg", "approved", true),
      photo("b-approved-2", "candidate-b", "b-approved-2.jpg", "approved", false),
      photo("b-approved-3", "candidate-b", "b-approved-3.jpg", "approved", false),
    ]);

    const signed = await signedDisplayablePhotosByCandidate(["candidate-b"], context, 2);

    expect(signed.get("candidate-b")).toEqual([signedUrl("b-primary.jpg"), signedUrl("b-approved-1.jpg")]);
  });

  test("returns an empty map without querying for empty candidate input", async () => {
    const { client, context } = contextWithPhotos([photo("a-primary", "candidate-a", "a-primary.jpg", "approved", true)]);

    const signed = await signedDisplayablePhotosByCandidate([], context);

    expect(signed.size).toBe(0);
    expect(client.queries).toEqual([]);
    expect(client.storage.requests).toEqual([]);
  });

  test("omits candidates with only pending or rejected photos", async () => {
    const { client, context } = contextWithPhotos([
      photo("c-pending", "candidate-c", "c-pending.jpg", "pending", true),
      photo("c-rejected", "candidate-c", "c-rejected.jpg", "rejected", false),
    ]);

    const signed = await signedDisplayablePhotosByCandidate(["candidate-c"], context);

    expect(signed.has("candidate-c")).toBe(false);
    expect(client.storage.requests).toEqual([]);
  });
});

const contextWithPhotos = (photos: PhotoFixture[]): { client: FakeRecommendationClient; context: CoreServiceContext } => {
  const client = new FakeRecommendationClient(photos);

  return {
    client,
    context: {
      client: client as unknown as SupabaseClient,
      actor: { source: "mcp", appUserId: "actor", scopes: [] },
    },
  };
};

const photo = (id: string, appUserId: string, path: string, moderationStatus: string | null, isPrimary: boolean): PhotoFixture => ({
  id,
  app_user_id: appUserId,
  bucket: "profile-private",
  path,
  moderation_status: moderationStatus,
  is_primary: isPrimary,
});

const signedUrl = (path: string): string => `https://signed.example/${path}`;

class FakeRecommendationClient {
  readonly queries: QueryTrace[] = [];
  readonly storage = new FakeStorage();

  constructor(private readonly photos: PhotoFixture[]) {}

  from(table: string): FakePhotoQuery {
    const trace: QueryTrace = { table, inFilters: [], eqFilters: [], orderings: [] };
    this.queries.push(trace);

    return new FakePhotoQuery(this.photos, trace);
  }
}

class FakePhotoQuery {
  constructor(private readonly photos: PhotoFixture[], private readonly trace: QueryTrace) {}

  select(columns: string): this {
    this.trace.selectedColumns = columns;

    return this;
  }

  in(column: string, values: unknown[]): this {
    this.trace.inFilters.push({ column, values });

    return this;
  }

  eq(column: string, value: unknown): this {
    this.trace.eqFilters.push({ column, value });

    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.trace.orderings.push({ column, options });

    return this;
  }

  async returns<Rows>(): Promise<{ data: Rows; error: null }> {
    const rows = this.photos
      .filter((photoRow) => this.trace.inFilters.every((filter) => filter.values.includes(photoRow[filter.column as keyof PhotoFixture])))
      .filter((photoRow) => this.trace.eqFilters.every((filter) => photoRow[filter.column as keyof PhotoFixture] === filter.value))
      .sort((left, right) => Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)));

    return { data: rows as unknown as Rows, error: null };
  }
}

class FakeStorage {
  readonly requests: SignedUrlRequest[] = [];

  from(bucket: string): FakeBucket {
    return new FakeBucket(bucket, this.requests);
  }
}

class FakeBucket {
  constructor(private readonly bucket: string, private readonly requests: SignedUrlRequest[]) {}

  async createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string }; error: null }> {
    this.requests.push({ bucket: this.bucket, path, expiresIn });

    return { data: { signedUrl: signedUrl(path) }, error: null };
  }
}

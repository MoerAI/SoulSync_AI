import { describe, expect, test } from "vitest";

import type { SyntheticProfileAnswerRow, SyntheticProfileRow, SyntheticSeedDatabase, SyntheticUserRow } from "./generate";
import { createMockSeedFriendli, seedSyntheticCandidates, SYNTHETIC_FORBIDDEN_TOPICS } from "./generate";

class MemorySeedDatabase implements SyntheticSeedDatabase {
  readonly appUsers = new Map<string, SyntheticUserRow>();
  readonly profiles = new Map<string, SyntheticProfileRow & { persona_spec?: Record<string, unknown> }>();
  readonly profileAnswers: SyntheticProfileAnswerRow[] = [];
  readonly profileEmbeddings = new Map<string, Record<string, unknown>>();

  readonly embeddingClient = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              single: async () => ({ data: this.profiles.get(value) ?? null, error: this.profiles.has(value) ? null : new Error("missing profile") }),
            }),
          }),
          upsert: async () => ({ error: null }),
        };
      }

      if (table === "profile_embeddings") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            this.profileEmbeddings.set(String(row.profile_id), row);

            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected embedding table ${table}`);
    },
  } as SyntheticSeedDatabase["embeddingClient"];

  async upsertAppUser(row: SyntheticUserRow): Promise<void> {
    this.appUsers.set(row.id, row);
  }

  async upsertProfile(row: SyntheticProfileRow): Promise<void> {
    this.profiles.set(row.id, { ...this.profiles.get(row.id), ...row });
  }

  async replaceProfileAnswers(appUserId: string, rows: SyntheticProfileAnswerRow[]): Promise<void> {
    for (let index = this.profileAnswers.length - 1; index >= 0; index -= 1) {
      if (this.profileAnswers[index]?.app_user_id === appUserId) {
        this.profileAnswers.splice(index, 1);
      }
    }

    this.profileAnswers.push(...rows);
  }

  async updateProfilePersona(profileId: string, persona: Record<string, unknown>): Promise<void> {
    const profile = this.profiles.get(profileId);

    if (!profile) {
      throw new Error(`Missing profile ${profileId}`);
    }

    this.profiles.set(profileId, { ...profile, persona_spec: persona });
  }
}

describe("seedSyntheticCandidates", () => {
  test("creates at least 50 fully labeled synthetic profiles with persona and embeddings", async () => {
    const database = new MemorySeedDatabase();

    await seedSyntheticCandidates(database, { count: 60, friendli: createMockSeedFriendli(60) });

    expect(database.appUsers.size).toBe(60);
    expect(database.profiles.size).toBe(60);
    expect(database.profiles.size).toBeGreaterThanOrEqual(50);
    expect(database.profileAnswers.length).toBeGreaterThanOrEqual(60 * 10);

    for (const user of database.appUsers.values()) {
      expect(user.is_synthetic).toBe(true);
      expect(user.age_verified).toBe(true);
    }

    for (const profile of database.profiles.values()) {
      expect(profile.is_synthetic).toBe(true);
      expect(profile.visibility).toBe("discoverable");
      expect(profile.persona_spec).toMatchObject({ id: profile.id, is_synthetic: true });
      expect(database.profileEmbeddings.has(profile.id)).toBe(true);
    }
  });

  test("spans MBTI, religion, city, gender, and orientation diversity", async () => {
    const database = new MemorySeedDatabase();

    await seedSyntheticCandidates(database, { count: 60, friendli: createMockSeedFriendli(60) });

    const profiles = [...database.profiles.values()];

    expect(new Set(profiles.map((profile) => profile.mbti)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(profiles.map((profile) => profile.religion_type)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(profiles.map((profile) => profile.city)).size).toBeGreaterThanOrEqual(5);
    expect([...new Set(profiles.map((profile) => profile.gender))]).toEqual(expect.arrayContaining(["female", "male"]));
    expect(profiles.some((profile) => profile.interested_in.includes("female"))).toBe(true);
    expect(profiles.some((profile) => profile.interested_in.includes("male"))).toBe(true);
  });

  test("is idempotent when re-run with stable seed ids", async () => {
    const database = new MemorySeedDatabase();

    await seedSyntheticCandidates(database, { count: 60, friendli: createMockSeedFriendli(60) });
    const firstCounts = {
      users: database.appUsers.size,
      profiles: database.profiles.size,
      answers: database.profileAnswers.length,
      embeddings: database.profileEmbeddings.size,
    };

    await seedSyntheticCandidates(database, { count: 60, friendli: createMockSeedFriendli(60) });

    expect({
      users: database.appUsers.size,
      profiles: database.profiles.size,
      answers: database.profileAnswers.length,
      embeddings: database.profileEmbeddings.size,
    }).toEqual(firstCounts);
  });

  test("adds synthetic persona forbidden topics for money, off-platform, and meeting requests", async () => {
    const database = new MemorySeedDatabase();

    await seedSyntheticCandidates(database, { count: 50, friendli: createMockSeedFriendli(50) });

    const persona = [...database.profiles.values()][0]?.persona_spec;
    const forbiddenTopics = persona?.forbiddenTopics;

    expect(forbiddenTopics).toEqual(expect.arrayContaining([...SYNTHETIC_FORBIDDEN_TOPICS]));
  });
});

import { describe, expect, test, vi } from "vitest";

import { MockFriendli } from "../friendli";
import type { JudgeScore, PersonaSpec, Transcript } from "../types";
import { demoMatchFriendli, runMatchJobInstant } from "./demoMatch";
import { enqueueMatchJob } from "./enqueue";
import { runMatchJob, type MatchPipelineDeps, type QueryLike, type SupabaseLike } from "./pipeline";

const CITY = "테스트통합시";
const SPARSE_CITY = "테스트희소시";
const FALLBACK_CITY = "테스트합성시";
const ACTOR_ID = "91000000-0000-0000-0000-000000000001";
const ACTOR_PROFILE_ID = "92000000-0000-0000-0000-000000000001";
const CANDIDATE_IDS = [
  "91000000-0000-0000-0000-000000000011",
  "91000000-0000-0000-0000-000000000012",
  "91000000-0000-0000-0000-000000000013",
  "91000000-0000-0000-0000-000000000014",
  "91000000-0000-0000-0000-000000000015",
  "91000000-0000-0000-0000-000000000016",
];

describe("runMatchJob", () => {
  test("runs a seeded scoped pool into at most three ranked recommendations and succeeds the job", async () => {
    const client = seedClient();
    const jobId = client.insertJob(ACTOR_ID);
    const deps = pipelineDeps(client);

    const result = await runMatchJob(jobId, deps);

    const recommendations = client.rows.recommendations.filter((row) => row.job_id === jobId);
    const job = client.rows.match_jobs.find((row) => row.id === jobId);

    expect(result.status).toBe("succeeded");
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations).toHaveLength(3);
    expect(recommendations).toHaveLength(3);
    expect(recommendations.map((row) => Number(row.overall))).toEqual([...recommendations.map((row) => Number(row.overall))].sort((a, b) => b - a));
    expect(recommendations.every((row) => row.is_synthetic === false)).toBe(true);
    expect(job?.status).toBe("succeeded");
    expect(job?.progress).toBe(100);
    expect(deps.friendli.calls.length).toBe(6);
    expect(client.lastRpcArgs?.filter_city).toBe(CITY);
  });

  test("reuses cached match simulations for unchanged profiles with zero new LLM calls", async () => {
    const client = seedClient();
    const firstDeps = pipelineDeps(client);
    await runMatchJob(client.insertJob(ACTOR_ID), firstDeps);

    const secondDeps = pipelineDeps(client);
    const secondJobId = client.insertJob(ACTOR_ID);
    const result = await runMatchJob(secondJobId, secondDeps);

    expect(result.status).toBe("succeeded");
    expect(result.recommendations).toHaveLength(3);
    expect(secondDeps.friendli.calls).toHaveLength(0);
    expect(client.rows.match_simulations.filter((row) => row.status === "succeeded")).toHaveLength(3);
  });

  test("continues after one judge failure, records that candidate as failed, and keeps others", async () => {
    const client = seedClient();
    let calls = 0;
    const judgeTranscript = vi.fn(async ({ personaB }: { personaB: PersonaSpec }) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("judge unavailable");
      }

      return judgeScore(personaB.id);
    });
    const deps = pipelineDeps(client, { judgeTranscript });
    const jobId = client.insertJob(ACTOR_ID);

    const result = await runMatchJob(jobId, deps);

    const failedSimulation = client.rows.match_simulations.find((row) => row.status === "failed");
    const recommendations = client.rows.recommendations.filter((row) => row.job_id === jobId);

    expect(result.status).toBe("succeeded");
    expect(failedSimulation?.status).toBe("failed");
    expect(recommendations.map((row) => row.candidate_id)).toEqual([CANDIDATE_IDS[0], CANDIDATE_IDS[2]]);
  });

  test("widens sparse pools with real synthetic candidates and persists fallback recommendations", async () => {
    const client = seedSparseClient();
    const jobId = client.insertJob(ACTOR_ID);
    const deps = pipelineDeps(client, { filterCity: SPARSE_CITY, candidatePoolSize: 1 });

    const result = await runMatchJob(jobId, deps);

    const recommendations = client.rows.recommendations.filter((row) => row.job_id === jobId);

    expect(result.status).toBe("succeeded");
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations.every((recommendation) => recommendation.is_synthetic)).toBe(true);
    expect(result.fallbackTrace.length).toBeGreaterThan(0);
    expect(recommendations).toHaveLength(3);
    expect(recommendations.every((row) => row.is_synthetic === true)).toBe(true);
    expect(result.candidateStatuses.every((status) => !status.candidateId.startsWith("synthetic-fallback-"))).toBe(true);
  });
});

describe("demo match job helpers", () => {
  test("demoMatchFriendli scripts six Korean conversation turns and one judge score per candidate", async () => {
    const friendli = demoMatchFriendli(2);
    if (!(friendli instanceof MockFriendli)) {
      throw new Error("demoMatchFriendli must return MockFriendli for deterministic demos");
    }

    for (let index = 0; index < 6; index += 1) {
      const completion = await friendli.chat([{ role: "user", content: `turn-${index}` }]);
      expect(completion.choices[0]?.message.content).toMatch(/안녕하세요|반갑습니다/);
    }
    const firstJudge = await friendli.chatJSON<JudgeScore>([{ role: "user", content: "judge" }], { type: "object" });
    for (let index = 0; index < 6; index += 1) {
      await friendli.chat([{ role: "user", content: `candidate-2-turn-${index}` }]);
    }
    const secondJudge = await friendli.chatJSON<JudgeScore>([{ role: "user", content: "judge" }], { type: "object" });

    expect(firstJudge).toEqual(judgeScoreForOverall(92));
    expect(secondJudge).toEqual(judgeScoreForOverall(85));
    expect(friendli.calls).toHaveLength(14);
    await expect(friendli.chat([{ role: "user", content: "extra" }])).rejects.toThrow("MockFriendli has no scripted responses left");
  });

  test("runMatchJobInstant runs the deterministic demo path and persists succeeded recommendations", async () => {
    const client = seedClient();
    const jobId = client.insertJob(ACTOR_ID);

    const result = await runMatchJobInstant(jobId, client, { now: () => new Date(now()) });

    const recommendations = client.rows.recommendations.filter((row) => row.job_id === jobId);
    const job = client.rows.match_jobs.find((row) => row.id === jobId);

    expect(result.status).toBe("succeeded");
    expect(result.recommendations).toHaveLength(3);
    expect(recommendations).toHaveLength(3);
    expect(recommendations.map((row) => row.overall)).toEqual([92, 87, 80]);
    expect(recommendations.map((row) => row.summary_ko)).toEqual([
      "92점 추천: 대화 흐름과 가치관 신호가 안정적입니다.",
      "85점 추천: 대화 흐름과 가치관 신호가 안정적입니다.",
      "78점 추천: 대화 흐름과 가치관 신호가 안정적입니다.",
    ]);
    expect(job).toMatchObject({ status: "succeeded", progress: 100 });
  });
});

describe("enqueueMatchJob", () => {
  test("returns a job id without running the pipeline inline", async () => {
    const client = seedClient();

    const jobId = await enqueueMatchJob({ source: "mcp", id: ACTOR_ID }, client);

    expect(jobId).toMatch(/job-/);
    expect(client.rows.match_jobs.find((row) => row.id === jobId)?.status).toBe("queued");
    expect(client.rows.match_simulations).toHaveLength(0);
    expect(client.rows.recommendations).toHaveLength(0);
  });
});

const pipelineDeps = (
  client: FakeSupabase,
  overrides: Partial<MatchPipelineDeps> = {},
): MatchPipelineDeps & { friendli: MockFriendli } => {
  const friendli = new MockFriendli([]);

  return {
    client,
    friendli,
    filterCity: CITY,
    embed: async () => [1, ...Array.from({ length: 383 }, () => 0)],
    simulateConversation: async (personaA, personaB) => {
      friendli.calls.push({ kind: "conversation", personaA: personaA.id, personaB: personaB.id });

      return transcript(personaA.id, personaB.id);
    },
    judgeTranscript: async ({ personaB }) => {
      friendli.calls.push({ kind: "judge", personaB: personaB.id });

      return judgeScore(personaB.id);
    },
    ...overrides,
  } as MatchPipelineDeps & { friendli: MockFriendli };
};

const seedClient = (): FakeSupabase => {
  const client = new FakeSupabase();
  client.rows.app_users.push({ id: ACTOR_ID, display_name: "actor", is_synthetic: false });
  client.rows.profiles.push(profileRow(ACTOR_PROFILE_ID, ACTOR_ID, "female", ["male"], "ENFP", 0));

  CANDIDATE_IDS.forEach((id, index) => {
    client.rows.app_users.push({ id, display_name: `candidate-${index + 1}`, is_synthetic: false });
    client.rows.profiles.push(profileRow(`92000000-0000-0000-0000-00000000001${index + 1}`, id, "male", ["female"], "INTJ", index + 1));
  });

  return client;
};

const seedSparseClient = (): FakeSupabase => {
  const client = new FakeSupabase();
  client.rows.app_users.push({ id: ACTOR_ID, display_name: "actor", is_synthetic: false });
  client.rows.profiles.push(profileRow(ACTOR_PROFILE_ID, ACTOR_ID, "female", ["male"], "ENFP", 0, { city: SPARSE_CITY }));

  CANDIDATE_IDS.slice(0, 3).forEach((id, index) => {
    client.rows.app_users.push({ id, display_name: `synthetic-${index + 1}`, is_synthetic: true });
    client.rows.profiles.push(profileRow(`92000000-0000-0000-0000-00000000001${index + 1}`, id, "male", ["female"], "INTJ", index + 1, { city: FALLBACK_CITY, isSynthetic: true }));
  });

  return client;
};

const profileRow = (id: string, appUserId: string, gender: string, interestedIn: string[], mbti: string, index: number, overrides: { city?: string; isSynthetic?: boolean } = {}): Record<string, unknown> => ({
  id,
  app_user_id: appUserId,
  gender,
  interested_in: interestedIn,
  city: overrides.city ?? CITY,
  district: "테스트구",
  mbti,
  religion_type: "기독교",
  religion_intensity: 3,
  values: {
    religion: { type: "기독교", intensity: 3 },
    familyValues: ["서로의 경계 존중하기"],
    lifePriorities: ["신뢰", "대화", "성장"],
    dealbreakers: ["흡연"],
  },
  visibility: "discoverable",
  is_synthetic: overrides.isSynthetic ?? false,
  profile_text: `테스트 프로필 ${index}`,
  persona_spec: persona(appUserId, `Candidate ${index}`, mbti, { city: overrides.city, isSynthetic: overrides.isSynthetic }),
  updated_at: `2026-05-31T00:00:0${index}.000Z`,
});

const persona = (id: string, displayName: string, mbti: string, overrides: { city?: string; isSynthetic?: boolean } = {}): PersonaSpec => ({
  id,
  displayName,
  city: overrides.city ?? CITY,
  district: "테스트구",
  mbti: mbti as PersonaSpec["mbti"],
  values: {
    religion: { type: "기독교", intensity: 3 },
    familyValues: ["서로의 경계 존중하기"],
    lifePriorities: ["신뢰", "대화", "성장"],
    dealbreakers: ["흡연"],
  },
  interests: ["독서", "산책"],
  boundaries: ["개인정보는 대화하지 않기"],
  is_synthetic: overrides.isSynthetic ?? false,
});

const transcript = (candidateAId: string, candidateBId: string): Transcript => ({
  id: `conversation:${candidateAId}:${candidateBId}`,
  candidateAId,
  candidateBId,
  turns: [
    { speakerId: candidateAId, content: "안녕하세요.", turnIndex: 0 },
    { speakerId: candidateBId, content: "반갑습니다.", turnIndex: 1 },
  ],
});

const judgeScore = (candidateId: string): JudgeScore => {
  const index = CANDIDATE_IDS.indexOf(candidateId);
  const overall = index < 0 ? 70 : 90 - index * 5;

  return {
    overall,
    subscores: {
      flow: 20,
      coherence: 18,
      mutual_curiosity: 18,
      values_alignment: 19,
      friction_risk: 15 - (overall - 60),
    },
    confidence: 0.9 - Math.max(index, 0) * 0.01,
    flags: ["balanced_exchange"],
    summaryKo: `${overall}점 추천`,
    rationale: "테스트 판단",
    judgePromptVersion: "judge-rubric-2026-05-31",
    judgeSchemaVersion: "judge-score-v1",
  };
};

const judgeScoreForOverall = (overall: number): JudgeScore => {
  const friction = 15 - (overall - 75);

  return {
    overall,
    subscores: { flow: 23, coherence: 18, mutual_curiosity: 18, values_alignment: 18, friction_risk: friction },
    confidence: 0.91,
    flags: ["balanced_exchange"],
    summaryKo: `${overall}점 추천: 대화 흐름과 가치관 신호가 안정적입니다.`,
    rationale: "Deterministic e2e judge fixture.",
    judgePromptVersion: "judge-rubric-2026-05-31",
    judgeSchemaVersion: "judge-score-v1",
  };
};

class FakeSupabase implements SupabaseLike {
  rows: Record<string, Record<string, unknown>[]> = {
    app_users: [],
    profiles: [],
    match_jobs: [],
    match_simulations: [],
    recommendations: [],
  };
  lastRpcArgs?: Record<string, unknown>;

  from<T = Record<string, unknown>>(table: string): QueryLike<T> {
    return new FakeQuery(this, table) as unknown as QueryLike<T>;
  }

  async rpc<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<{ data: T[]; error: null }> {
    this.lastRpcArgs = args;
    if (name !== "match_candidate_profiles") {
      return { data: [], error: null };
    }

    const actor = this.rows.profiles.find((row) => row.app_user_id === args.query_user_id);
    const rows = this.rows.profiles
      .filter((row) => row.app_user_id !== args.query_user_id)
      .filter((row) => row.visibility === "discoverable")
      .filter((row) => !args.filter_city || row.city === args.filter_city)
      .filter((row) => !args.filter_gender || (row.interested_in as string[]).includes(String(args.filter_gender)))
      .filter((row) => !args.filter_interested_in || (args.filter_interested_in as string[]).includes(String(row.gender)))
      .slice(0, Number(args.match_count ?? 20))
      .map((row, index) => ({
        profile_id: row.id,
        app_user_id: row.app_user_id,
        gender: row.gender,
        interested_in: row.interested_in,
        city: row.city,
        religion_type: row.religion_type,
        persona_spec: row.persona_spec,
        is_synthetic: row.is_synthetic,
        similarity: actor ? 1 - index / 100 : 0,
      }));

    return { data: rows as T[], error: null };
  }

  insertJob(appUserId: string): string {
    const id = `job-${this.rows.match_jobs.length + 1}`;
    this.rows.match_jobs.push({ id, app_user_id: appUserId, status: "queued", progress: 0, created_at: now(), updated_at: now() });

    return id;
  }
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  constructor(private readonly client: FakeSupabase, private readonly table: string) {}

  select(): this {
    if (!this.payload) {
      this.operation = "select";
    }
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

  limit(): this {
    return this;
  }

  order(): this {
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

  upsert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.operation = "delete";
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
      const inserted = payloads.map((payload) => ({ id: payload.id ?? this.nextId(table.length + 1), ...payload }));
      table.push(...inserted);
      return { data: inserted, error: null };
    }

    if (this.operation === "update") {
      matched.forEach((row) => Object.assign(row, this.payload, { updated_at: now() }));
      return { data: matched, error: null };
    }

    if (this.operation === "delete") {
      this.client.rows[this.table] = table.filter((row) => !this.matches(row));
      return { data: matched, error: null };
    }

    return { data: matched, error: null };
  }

  private matches(row: Record<string, unknown>): boolean {
    return this.filters.every(([column, value]) => (value instanceof Set ? value.has(row[column]) : row[column] === value));
  }

  private nextId(sequence: number): string {
    return this.table === "match_jobs" ? `job-${sequence}` : `${this.table}-${sequence}`;
  }
}

const now = (): string => "2026-05-31T00:00:00.000Z";

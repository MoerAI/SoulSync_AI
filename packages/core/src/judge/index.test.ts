import { describe, expect, test, vi } from "vitest";

import { FriendliClient, MockFriendli, type FriendliChatOptions, type FriendliHttpClient, type FriendliLike, type JsonSchema } from "../friendli";
import { JudgeScoreSchema, type JudgeScore, type PersonaSpec, type Transcript } from "../types";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { JUDGE_PROMPT_VERSION, JUDGE_SCHEMA_VERSION, compareJudgeScores, judgeTranscript, scoreVariance } from "./index";

const personaA: PersonaSpec = {
  id: "persona-a",
  displayName: "민지",
  ageRange: "30-34",
  city: "서울",
  mbti: "ENFP",
  values: {
    religion: { type: "무교", intensity: 2 },
    familyValues: ["warm family"],
    lifePriorities: ["growth", "kindness"],
    dealbreakers: ["dishonesty"],
  },
  interests: ["books", "hiking"],
  communicationStyle: "asks warm follow-up questions",
  boundaries: ["move slowly"],
  is_synthetic: true,
};

const personaB: PersonaSpec = {
  id: "persona-b",
  displayName: "준호",
  ageRange: "30-34",
  city: "서울",
  mbti: "INFJ",
  values: {
    religion: { type: "무교", intensity: 2 },
    familyValues: ["warm family"],
    lifePriorities: ["growth", "kindness"],
    dealbreakers: ["dishonesty"],
  },
  interests: ["books", "cooking"],
  communicationStyle: "reflective and curious",
  boundaries: ["no pressure"],
  is_synthetic: true,
};

const transcript: Transcript = {
  id: "conversation:persona-a:persona-b",
  candidateAId: personaA.id,
  candidateBId: personaB.id,
  turns: [
    { speakerId: personaA.id, turnIndex: 0, content: "요즘 읽은 책 중에 마음에 남은 게 있어요?" },
    { speakerId: personaB.id, turnIndex: 1, content: "있어요. 관계에 관한 책인데, 민지님은 산책하면서 대화하는 걸 좋아하세요?" },
    { speakerId: personaA.id, turnIndex: 2, content: "네, 천천히 걸으면서 서로 질문하는 시간이 좋아요." },
    { speakerId: personaB.id, turnIndex: 3, content: "저도 비슷해요. 서로의 속도를 존중하는 게 중요하다고 느껴요." },
  ],
};

const validJudge = (overrides: Partial<JudgeScore> = {}): JudgeScore => ({
  overall: 83,
  subscores: {
    flow: 22,
    coherence: 17,
    mutual_curiosity: 18,
    values_alignment: 16,
    friction_risk: 5,
  },
  confidence: 0.86,
  flags: ["balanced_exchange"],
  summaryKo: "서로 질문을 주고받으며 속도와 가치관이 잘 맞았습니다.",
  rationale: "Both people showed reciprocal curiosity without over-rewarding response length.",
  judgePromptVersion: JUDGE_PROMPT_VERSION,
  judgeSchemaVersion: JUDGE_SCHEMA_VERSION,
  ...overrides,
});

class DeterministicJudgeMock implements FriendliLike {
  readonly calls: object[] = [];

  async chat(_messages: ChatCompletionMessageParam[], _opts: FriendliChatOptions = {}): Promise<ChatCompletion> {
    throw new Error("chat should not be used by judgeTranscript");
  }

  async chatJSON<T>(messages: ChatCompletionMessageParam[], jsonSchema: JsonSchema, opts: FriendliChatOptions = {}): Promise<T> {
    this.calls.push({ messages, jsonSchema, ...opts });
    return validJudge() as T;
  }
}

describe("judgeTranscript", () => {
  test("returns a zod-valid structured score using the locked rubric formula and version pins", async () => {
    const friendli = new MockFriendli([{ status: 200, body: validJudge({ overall: 1 }) }]);

    const score = await judgeTranscript({ personaA, personaB, transcript, friendli, randomizeOrder: false });

    expect(JudgeScoreSchema.parse(score)).toEqual(score);
    expect(score.overall).toBe(score.subscores.flow + score.subscores.coherence + score.subscores.mutual_curiosity + score.subscores.values_alignment + (15 - score.subscores.friction_risk));
    expect(score.judgePromptVersion).toBe(JUDGE_PROMPT_VERSION);
    expect(score.judgeSchemaVersion).toBe(JUDGE_SCHEMA_VERSION);
    expect(score.overall).toBe(83);

    const call = friendli.calls[0] as { messages: Array<{ content?: unknown }>; jsonSchema: unknown; temperature?: number; enable_thinking?: boolean };
    expect(call).toMatchObject({ temperature: 0, enable_thinking: true });
    expect(call.jsonSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(call.messages)).toContain("CALIBRATION ANCHORS");
    expect(JSON.stringify(call.messages)).toContain("Do not reward length");
    expect(JSON.stringify(call.messages)).toContain("Person X");
    expect(JSON.stringify(call.messages)).toContain("Person Y");
    expect(JSON.stringify(call.messages)).not.toContain("민지");
    expect(JSON.stringify(call.messages)).not.toContain("준호");
  });

  test("returns a safe low-confidence score instead of throwing when invalid JSON persists", async () => {
    const friendli = new MockFriendli([
      { status: 200, body: "not json" },
      { status: 200, body: "still not json" },
    ]);

    await expect(judgeTranscript({ personaA, personaB, transcript, friendli })).resolves.toMatchObject({
      overall: 0,
      confidence: 0,
      flags: ["insufficient_signal"],
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      judgeSchemaVersion: JUDGE_SCHEMA_VERSION,
    });
    expect(friendli.calls).toHaveLength(2);
  });

  test("backs off through FriendliClient after a 429 and then returns the valid score", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const create = vi
      .fn<FriendliHttpClient["chat"]["completions"]["create"]>()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(await new MockFriendli([{ status: 200, body: validJudge() }]).chat([]));
    const friendli = new FriendliClient({ httpClient: { chat: { completions: { create } } } });
    const request = judgeTranscript({ personaA, personaB, transcript, friendli, randomizeOrder: false });

    await vi.advanceTimersByTimeAsync(1000);

    const score = await request;
    expect(score.overall).toBe(83);
    expect(create).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("keeps deterministic swap presentation within the documented tolerance", async () => {
    const forward = await judgeTranscript({ personaA, personaB, transcript, friendli: new DeterministicJudgeMock(), randomizeOrder: false });
    const swapped = await judgeTranscript({ personaA: personaB, personaB: personaA, transcript, friendli: new DeterministicJudgeMock(), randomizeOrder: false });

    expect(Math.abs(forward.overall - swapped.overall)).toBeLessThanOrEqual(3);
    expect(scoreVariance([forward, swapped])).toBeLessThanOrEqual(9);
  });

  test("uses confidence then lower friction risk as the equal-overall tie break", () => {
    const higherConfidence = validJudge({ confidence: 0.9, subscores: { ...validJudge().subscores, friction_risk: 8 } });
    const lowerFriction = validJudge({ confidence: 0.7, subscores: { ...validJudge().subscores, friction_risk: 3 } });

    expect(compareJudgeScores(higherConfidence, lowerFriction)).toBeLessThan(0);
    expect(compareJudgeScores({ ...higherConfidence, confidence: 0.7 }, lowerFriction)).toBeGreaterThan(0);
  });
});

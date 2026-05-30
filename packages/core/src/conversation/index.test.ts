import { describe, expect, test } from "vitest";

import { MockFriendli } from "../friendli";
import type { PersonaPreview } from "../persona";
import { simulateConversation } from "./index";

const personaA: PersonaPreview = {
  id: "persona-a",
  displayName: "A",
  interests: ["books"],
  boundaries: [],
  is_synthetic: true,
  allowedTalkingPoints: ["books"],
  forbiddenTopics: [],
};

const personaB: PersonaPreview = {
  id: "persona-b",
  displayName: "B",
  interests: ["hiking"],
  boundaries: [],
  is_synthetic: true,
  allowedTalkingPoints: ["hiking"],
  forbiddenTopics: [],
};

const personaWithForbiddenTopic: PersonaPreview = {
  ...personaA,
  forbiddenTopics: ["서울시 강남구 테헤란로 123"],
};

const sixTurnMock = () =>
  new MockFriendli([
    { status: 200, body: "A1" },
    { status: 200, body: "B1" },
    { status: 200, body: "A2" },
    { status: 200, body: "B2" },
    { status: 200, body: "A3" },
    { status: 200, body: "B3" },
  ]);

describe("simulateConversation", () => {
  test("runs a deterministic six-turn A/B alternation", async () => {
    const first = await simulateConversation(personaA, personaB, { friendli: sixTurnMock() });
    const second = await simulateConversation(personaA, personaB, { friendli: sixTurnMock() });

    expect(first.turns).toHaveLength(6);
    expect(first.turns.map((turn) => turn.speaker)).toEqual(["A", "B", "A", "B", "A", "B"]);
    expect(first).toEqual(second);
  });

  test("caps each turn and records per-turn usage", async () => {
    const friendli = new MockFriendli([
      { status: 200, body: "A response that should be clamped by the configured token cap." },
      { status: 200, body: "B response that should be clamped by the configured token cap." },
    ]);

    const transcript = await simulateConversation(personaA, personaB, { friendli, maxTokensPerTurn: 5, maxTurnsPerAgent: 1 });

    expect(transcript.turns).toHaveLength(2);
    for (const turn of transcript.turns) {
      expect(turn.usage.completionTokens).toBeLessThanOrEqual(5);
      expect(turn.usage.totalTokens).toBe(turn.usage.promptTokens + turn.usage.completionTokens);
    }
    expect(friendli.calls).toHaveLength(2);
    expect(friendli.calls[0]).toMatchObject({ maxTokens: 5 });
  });

  test("stops early on explicit incompatibility or safety phrases", async () => {
    const friendli = new MockFriendli([
      { status: 200, body: "A1" },
      { status: 200, body: "B1" },
      { status: 200, body: "안 맞는 것 같아요" },
      { status: 200, body: "B2 should not be used" },
    ]);

    const transcript = await simulateConversation(personaA, personaB, { friendli });

    expect(transcript.turns).toHaveLength(3);
    expect(transcript.turns.at(-1)?.speaker).toBe("A");
    expect(friendli.calls).toHaveLength(3);
  });

  test("blocks adversarial output containing a forbidden topic", async () => {
    const friendli = new MockFriendli([
      { status: 200, body: "제 주소는 서울시 강남구 테헤란로 123 입니다." },
      { status: 200, body: "B1" },
    ]);

    const transcript = await simulateConversation(personaWithForbiddenTopic, personaB, { friendli, maxTurnsPerAgent: 1 });

    expect(JSON.stringify(transcript.turns)).not.toContain("서울시 강남구 테헤란로 123");
    expect(transcript.turns[0]?.content).toBe("[blocked: forbidden topic]");
  });
});

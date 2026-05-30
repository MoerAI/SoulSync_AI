import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_FRIENDLI_BASE_URL, DEFAULT_FRIENDLI_MODEL, FriendliClient, MockFriendli, type FriendliHttpClient } from "../client";

const messages = [{ role: "user" as const, content: "score this match" }];
const schema = {
  type: "object",
  properties: { overall: { type: "number" } },
  required: ["overall"],
  additionalProperties: false,
};

describe("FriendliClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("chat() sends correct model through an OpenAI-compatible baseURL client", async () => {
    const mock = new MockFriendli([{ status: 200, body: "hello" }]);
    const client = new FriendliClient({ httpClient: mock.asHttpClient(), baseURL: DEFAULT_FRIENDLI_BASE_URL });

    const result = await client.chat(messages);

    expect(client.baseURL).toBe(DEFAULT_FRIENDLI_BASE_URL);
    expect(result.choices[0]?.message.content).toBe("hello");
    expect(mock.calls[0]).toMatchObject({
      messages,
      model: DEFAULT_FRIENDLI_MODEL,
    });
  });

  test("429 then 200 returns success after one backoff retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const create = vi
      .fn<FriendliHttpClient["chat"]["completions"]["create"]>()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(await new MockFriendli([{ status: 200, body: "ok" }]).chat(messages));
    const client = new FriendliClient({ httpClient: { chat: { completions: { create } } } });
    const request = client.chat(messages);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toMatchObject({ choices: [{ message: { content: "ok" } }] });
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("chatJSON repairs fenced response into a valid object", async () => {
    const mock = new MockFriendli([{ status: 200, body: "```json\n{\"overall\":80}\n```extra" }]);
    const client = new FriendliClient({ httpClient: mock.asHttpClient() });

    await expect(client.chatJSON<{ overall: number }>(messages, schema)).resolves.toEqual({ overall: 80 });
    expect(mock.calls[0]).toMatchObject({
      model: DEFAULT_FRIENDLI_MODEL,
      response_format: {
        type: "json_schema",
        json_schema: { name: "response", schema, strict: true },
      },
    });
    expect(mock.calls[0]).not.toHaveProperty("tools");
  });

  test("chatJSON with non-JSON twice throws a controlled error", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const mock = new MockFriendli([
      { status: 500 },
      { status: 200, body: "not json" },
    ]);
    const client = new FriendliClient({ httpClient: mock.asHttpClient() });

    const request = client.chatJSON(messages, schema);
    const expectation = expect(request).rejects.toThrow("Unable to parse Friendli JSON response");
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
  });
});

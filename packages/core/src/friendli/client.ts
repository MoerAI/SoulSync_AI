import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const DEFAULT_FRIENDLI_BASE_URL = "https://api.friendli.ai/serverless/v1";
export const DEFAULT_FRIENDLI_MODEL = "LGAI-EXAONE/K-EXAONE-236B-A23B";

export type FriendliChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  enable_thinking?: boolean;
  top_p?: number;
  stop?: string | string[];
};

export type FriendliConfig = {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  httpClient?: FriendliHttpClient;
};

export type JsonSchema = Record<string, unknown>;

export type FriendliChatRequest = ChatCompletionCreateParamsNonStreaming & {
  timeout?: number;
  chat_template_kwargs?: { enable_thinking: boolean };
};

export interface FriendliHttpClient {
  chat: {
    completions: {
      create: (request: FriendliChatRequest) => Promise<ChatCompletion>;
    };
  };
}

export interface FriendliLike {
  chat(messages: ChatCompletionMessageParam[], opts?: FriendliChatOptions): Promise<ChatCompletion>;
  chatJSON<T>(messages: ChatCompletionMessageParam[], jsonSchema: JsonSchema, opts?: FriendliChatOptions): Promise<T>;
}

export type MockFriendliResponse =
  | { status: 200; body: ChatCompletion | string | Record<string, unknown> }
  | { status: 429 | 500 | 502 | 503 | 504; body?: unknown };

export class FriendliError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "FriendliError";
  }
}

export class FriendliClient implements FriendliLike {
  readonly baseURL: string;
  readonly model: string;
  private readonly httpClient: FriendliHttpClient;

  constructor(config: FriendliConfig = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

    this.baseURL = config.baseURL ?? env?.FRIENDLI_BASE_URL ?? DEFAULT_FRIENDLI_BASE_URL;
    this.model = config.model ?? env?.FRIENDLI_MODEL ?? DEFAULT_FRIENDLI_MODEL;
    this.httpClient = config.httpClient ?? new OpenAI({ apiKey: config.apiKey ?? env?.FRIENDLI_API_KEY, baseURL: this.baseURL });
  }

  async chat(messages: ChatCompletionMessageParam[], opts: FriendliChatOptions = {}): Promise<ChatCompletion> {
    return this.withRetry(() => this.httpClient.chat.completions.create(this.requestFor(messages, opts)));
  }

  async chatJSON<T>(messages: ChatCompletionMessageParam[], jsonSchema: JsonSchema, opts: FriendliChatOptions = {}): Promise<T> {
    const completion = await this.withRetry(() =>
      this.httpClient.chat.completions.create({
        ...this.requestFor(messages, opts),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: jsonSchema,
            strict: true,
          },
        },
      }),
    );

    const content = completion.choices[0]?.message?.content;

    if (typeof content !== "string") {
      throw new FriendliError("Friendli response did not include JSON content");
    }

    return parseJsonWithRepair<T>(content);
  }

  private requestFor(messages: ChatCompletionMessageParam[], opts: FriendliChatOptions): FriendliChatRequest {
    return {
      messages,
      model: opts.model ?? this.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      timeout: opts.timeout,
      top_p: opts.top_p,
      stop: opts.stop,
      chat_template_kwargs: opts.enable_thinking === undefined ? undefined : { enable_thinking: opts.enable_thinking },
    };
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === 3 || !isRetryableError(error)) {
          throw error;
        }

        await sleep(backoffDelay(attempt));
      }
    }

    throw lastError;
  }
}

export class MockFriendli implements FriendliLike {
  readonly calls: object[] = [];
  private readonly responses: MockFriendliResponse[];

  constructor(responses: MockFriendliResponse[]) {
    this.responses = [...responses];
  }

  async chat(messages: ChatCompletionMessageParam[], opts: FriendliChatOptions = {}): Promise<ChatCompletion> {
    return this.nextCompletion({ messages, ...opts });
  }

  async chatJSON<T>(messages: ChatCompletionMessageParam[], jsonSchema: JsonSchema, opts: FriendliChatOptions = {}): Promise<T> {
    const completion = await this.nextCompletion({ messages, jsonSchema, ...opts });
    const content = completion.choices[0]?.message?.content;

    if (typeof content !== "string") {
      throw new FriendliError("Mock Friendli response did not include JSON content");
    }

    return parseJsonWithRepair<T>(content);
  }

  asHttpClient(): FriendliHttpClient {
    return {
      chat: {
        completions: {
          create: async (request) => this.nextCompletion(request),
        },
      },
    };
  }

  private async nextCompletion(request: object): Promise<ChatCompletion> {
    this.calls.push(request);
    const response = this.responses.shift();

    if (!response) {
      throw new FriendliError("MockFriendli has no scripted responses left");
    }

    if (response.status !== 200) {
      throw Object.assign(new Error(`Friendli mock status ${response.status}`), { status: response.status });
    }

    return toCompletion(response.body);
  }
}

export function parseJsonWithRepair<T = unknown>(text: string): T {
  const cleaned = stripFence(text.trim());
  const endIndex = findClosingJsonIndex(cleaned);
  const candidate = endIndex >= 0 ? cleaned.slice(0, endIndex + 1) : cleaned;

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new FriendliError("Unable to parse Friendli JSON response", error);
  }
}

function stripFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);

  return fenced?.[1]?.trim() ?? text;
}

function findClosingJsonIndex(text: string): number {
  const start = text.search(/[\[{]/);

  if (start < 0) {
    return -1;
  }

  const opening = text[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
    }

    if (char === closing) {
      depth -= 1;
    }

    if (depth === 0) {
      return index;
    }
  }

  return -1;
}

function isRetryableError(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;

  return status === 429 || status >= 500;
}

function backoffDelay(attempt: number): number {
  const baseMs = 1000;
  const jitterMs = Math.floor(Math.random() * 100);

  return baseMs * 2 ** attempt + jitterMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCompletion(body: ChatCompletion | string | Record<string, unknown>): ChatCompletion {
  if (typeof body === "string") {
    return completionWithContent(body);
  }

  if ("choices" in body) {
    return body as ChatCompletion;
  }

  return completionWithContent(JSON.stringify(body));
}

function completionWithContent(content: string): ChatCompletion {
  return {
    id: "mock-chatcmpl",
    object: "chat.completion",
    created: 0,
    model: DEFAULT_FRIENDLI_MODEL,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: {
          role: "assistant",
          content,
          refusal: null,
        },
      },
    ],
  };
}

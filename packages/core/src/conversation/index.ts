import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { FriendliClient, type FriendliLike } from "../friendli";
import { personaSystemPrompt, type PersonaPreview } from "../persona";
import { sanitizeProfileText } from "../safety/sanitize";
import type { ConversationTurn as BaseConversationTurn, Transcript as BaseTranscript } from "../types";

export type ConversationSpeaker = "A" | "B";

export type ConversationTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ConversationTurn = Omit<BaseConversationTurn, "speakerId"> & {
  speaker: ConversationSpeaker;
  speakerId: string;
  usage: ConversationTokenUsage;
};

export type Transcript = Omit<BaseTranscript, "turns"> & {
  turns: ConversationTurn[];
};

export type SimulateConversationOptions = {
  friendli?: FriendliLike;
  maxTokensPerTurn?: number;
  maxTurnsPerAgent?: number;
};

const DEFAULT_MAX_TOKENS_PER_TURN = 160;
const DEFAULT_MAX_TURNS_PER_AGENT = 3;
const BLOCKED_FORBIDDEN_TOPIC = "[blocked: forbidden topic]";
const EARLY_STOP_PHRASES = ["안 맞는 것 같아요", "불편해요", "unsafe", "incompatible", "not compatible", "not a good fit"];

export const simulateConversation = async (personaA: PersonaPreview, personaB: PersonaPreview, opts: SimulateConversationOptions = {}): Promise<Transcript> => {
  const friendli = opts.friendli ?? new FriendliClient();
  const maxTokensPerTurn = opts.maxTokensPerTurn ?? DEFAULT_MAX_TOKENS_PER_TURN;
  const maxTurnsPerAgent = opts.maxTurnsPerAgent ?? DEFAULT_MAX_TURNS_PER_AGENT;
  const turns: ConversationTurn[] = [];

  for (let round = 0; round < maxTurnsPerAgent; round += 1) {
    for (const speaker of ["A", "B"] as const) {
      const self = speaker === "A" ? personaA : personaB;
      const other = speaker === "A" ? personaB : personaA;
      const messages = messagesForTurn(self, other, turns);
      const completion = await friendli.chat(messages, {
        temperature: 0.7,
        maxTokens: maxTokensPerTurn,
      });
      const sanitizedContent = sanitizeProfileText(completion.choices[0]?.message.content ?? "");
      const content = containsForbiddenTopic(sanitizedContent, [personaA, personaB]) ? BLOCKED_FORBIDDEN_TOPIC : sanitizedContent;
      const completionTokens = Math.min(maxTokensPerTurn, estimateTokens(content));
      const promptTokens = completion.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages));

      turns.push({
        speaker,
        speakerId: self.id,
        content,
        turnIndex: turns.length,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      });

      if (shouldStopEarly(content)) {
        return transcriptFor(personaA, personaB, turns);
      }
    }
  }

  return transcriptFor(personaA, personaB, turns);
};

export const shouldStopEarly = (text: string): boolean => {
  const normalized = sanitizeProfileText(text).toLowerCase();

  return EARLY_STOP_PHRASES.some((phrase) => normalized.includes(phrase.toLowerCase()));
};

const transcriptFor = (personaA: PersonaPreview, personaB: PersonaPreview, turns: ConversationTurn[]): Transcript => ({
  id: `conversation:${personaA.id}:${personaB.id}`,
  candidateAId: personaA.id,
  candidateBId: personaB.id,
  turns,
});

const messagesForTurn = (self: PersonaPreview, other: PersonaPreview, turns: ConversationTurn[]): ChatCompletionMessageParam[] => [
  { role: "system", content: personaSystemPrompt(self, other) },
  {
    role: "user",
    content: JSON.stringify({
      transcript: turns.map((turn) => ({ speaker: turn.speaker, content: turn.content })),
    }),
  },
];

const containsForbiddenTopic = (text: string, personas: PersonaPreview[]): boolean => {
  const normalizedText = normalizeForMatch(text);
  const forbiddenTopics = personas.flatMap((persona) => persona.forbiddenTopics ?? []).map(sanitizeProfileText).filter((topic) => topic.length > 0);

  return forbiddenTopics.some((topic) => normalizedText.includes(normalizeForMatch(topic)));
};

const normalizeForMatch = (text: string): string => sanitizeProfileText(text).toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

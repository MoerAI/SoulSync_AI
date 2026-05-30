import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { toJSONSchema } from "zod";

import { FriendliClient, type FriendliLike, type FriendliChatOptions, type JsonSchema } from "../friendli";
import { JudgeScoreSchema, type JudgeScore, type PersonaSpec, type Transcript } from "../types";

export const JUDGE_PROMPT_VERSION = "judge-rubric-2026-05-31";
export const JUDGE_SCHEMA_VERSION = "judge-score-v1";
export const SWAP_CONSISTENCY_OVERALL_TOLERANCE = 3;
export const SCORE_VARIANCE_BOUND = 9;

export type JudgeTranscriptInput = {
  personaA: PersonaSpec;
  personaB: PersonaSpec;
  transcript: Transcript;
  friendli?: FriendliLike;
  randomizeOrder?: boolean;
};

export const judgeTranscript = async ({ personaA, personaB, transcript, friendli = new FriendliClient(), randomizeOrder = true }: JudgeTranscriptInput): Promise<JudgeScore> => {
  const presentation = anonymizedPresentation(personaA, personaB, transcript, randomizeOrder);
  const messages = judgeMessages(presentation);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawScore = await chatJudgeJSON(friendli, messages);
      const normalized = normalizeJudgeScore(rawScore);
      const parsed = JudgeScoreSchema.safeParse(normalized);

      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Persistent model or transport failures fall through to a safe score below.
    }
  }

  return safeLowConfidenceScore();
};

export const compareJudgeScores = (left: JudgeScore, right: JudgeScore): number => {
  if (left.overall !== right.overall) {
    return right.overall - left.overall;
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return left.subscores.friction_risk - right.subscores.friction_risk;
};

export const scoreVariance = (scores: JudgeScore[]): number => {
  if (scores.length === 0) {
    return 0;
  }

  const mean = scores.reduce((sum, score) => sum + score.overall, 0) / scores.length;

  return scores.reduce((sum, score) => sum + (score.overall - mean) ** 2, 0) / scores.length;
};

const JUDGE_JSON_SCHEMA = toJSONSchema(JudgeScoreSchema, { io: "output" }) as JsonSchema;

type JudgePresentation = {
  personX: AnonymizedPersona;
  personY: AnonymizedPersona;
  transcript: Array<{ speaker: "Person X" | "Person Y" | "Unknown"; content: string; turnIndex: number }>;
  mapping: Record<"Person X" | "Person Y", string>;
};

type AnonymizedPersona = {
  ageRange?: string;
  city?: string;
  mbti?: string;
  values?: PersonaSpec["values"];
  interests: string[];
  communicationStyle?: string;
  boundaries: string[];
  is_synthetic: boolean;
};

type ModelJudgeScore = Partial<JudgeScore> & Record<string, unknown>;

type JudgeChatOptions = FriendliChatOptions & { enable_thinking: boolean };

const chatJudgeJSON = (friendli: FriendliLike, messages: ChatCompletionMessageParam[]): Promise<ModelJudgeScore> =>
  friendli.chatJSON<ModelJudgeScore>(messages, JUDGE_JSON_SCHEMA, { temperature: 0, maxTokens: 900, enable_thinking: true } as JudgeChatOptions);

const judgeMessages = (presentation: JudgePresentation): ChatCompletionMessageParam[] => [
  {
    role: "system",
    content: [
      `SoulSync AI judge prompt version ${JUDGE_PROMPT_VERSION}.`,
      "Return strict JSON matching the provided schema only.",
      "Score a short dating-match transcript with the locked rubric below.",
      "Use anonymized Person X and Person Y only. Do not infer from names, order, gender, response length, or verbosity.",
      "Do not reward length; reward reciprocal signal, specificity, respect, and compatibility evidence.",
      "Do not expose hidden reasoning. Put a concise user-safe explanation in rationale.",
      "LOCKED FORMULA: overall = flow + coherence + mutual_curiosity + values_alignment + (15 - friction_risk).",
      "Rubric ranges: flow 0-25, coherence 0-20, mutual_curiosity 0-20, values_alignment 0-20, friction_risk 0-15 penalty, confidence 0-1.",
      "CALIBRATION ANCHORS:",
      "95-100: natural balanced exchange, clear reciprocal curiosity, aligned values, no pressure or safety friction.",
      "75-85: promising exchange with mostly reciprocal questions and mild unknowns or small awkward moments.",
      "45-60: understandable conversation but thin curiosity, weak evidence, or notable mismatch signals.",
      "0-25: insufficient signal, unsafe pressure, direct incompatibility, hostile tone, or repeated boundary friction.",
      "Flags should be short snake_case labels such as insufficient_signal, balanced_exchange, one_sided_curiosity, value_mismatch, boundary_friction.",
      `Always set judgePromptVersion to ${JUDGE_PROMPT_VERSION} and judgeSchemaVersion to ${JUDGE_SCHEMA_VERSION}.`,
    ].join("\n"),
  },
  {
    role: "user",
    content: JSON.stringify({
      task: "Score this SoulSync transcript using only the anonymized evidence.",
      personX: presentation.personX,
      personY: presentation.personY,
      transcript: presentation.transcript,
      schemaVersion: JUDGE_SCHEMA_VERSION,
    }),
  },
];

const anonymizedPresentation = (personaA: PersonaSpec, personaB: PersonaSpec, transcript: Transcript, randomizeOrder: boolean): JudgePresentation => {
  const swap = randomizeOrder ? Math.random() < 0.5 : false;
  const personXSource = swap ? personaB : personaA;
  const personYSource = swap ? personaA : personaB;
  const speakerMap = new Map<string, "Person X" | "Person Y">([
    [personXSource.id, "Person X"],
    [personYSource.id, "Person Y"],
  ]);

  const replacements = [
    [personXSource.displayName, "Person X"],
    [personYSource.displayName, "Person Y"],
  ] as const;

  return {
    personX: anonymizedPersona(personXSource),
    personY: anonymizedPersona(personYSource),
    transcript: transcript.turns.map((turn) => ({
      speaker: speakerMap.get(turn.speakerId) ?? "Unknown",
      content: anonymizeTranscriptContent(turn.content, replacements),
      turnIndex: turn.turnIndex,
    })),
    mapping: {
      "Person X": personXSource.id,
      "Person Y": personYSource.id,
    },
  };
};

const anonymizeTranscriptContent = (content: string, replacements: ReadonlyArray<readonly [string, string]>): string =>
  replacements.reduce((text, [name, label]) => (name.trim().length > 0 ? text.split(name).join(label) : text), content);

const anonymizedPersona = (persona: PersonaSpec): AnonymizedPersona => ({
  ageRange: persona.ageRange,
  city: persona.city,
  mbti: persona.mbti,
  values: persona.values,
  interests: persona.interests,
  communicationStyle: persona.communicationStyle,
  boundaries: persona.boundaries,
  is_synthetic: persona.is_synthetic,
});

const normalizeJudgeScore = (rawScore: ModelJudgeScore): JudgeScore => {
  const subscores = {
    flow: clampNumber(rawScore.subscores && typeof rawScore.subscores === "object" ? (rawScore.subscores as Record<string, unknown>).flow : undefined, 0, 25),
    coherence: clampNumber(rawScore.subscores && typeof rawScore.subscores === "object" ? (rawScore.subscores as Record<string, unknown>).coherence : undefined, 0, 20),
    mutual_curiosity: clampNumber(rawScore.subscores && typeof rawScore.subscores === "object" ? (rawScore.subscores as Record<string, unknown>).mutual_curiosity : undefined, 0, 20),
    values_alignment: clampNumber(rawScore.subscores && typeof rawScore.subscores === "object" ? (rawScore.subscores as Record<string, unknown>).values_alignment : undefined, 0, 20),
    friction_risk: clampNumber(rawScore.subscores && typeof rawScore.subscores === "object" ? (rawScore.subscores as Record<string, unknown>).friction_risk : undefined, 0, 15),
  };

  return {
    overall: lockedOverall(subscores),
    subscores,
    confidence: clampNumber(rawScore.confidence, 0, 1),
    flags: Array.isArray(rawScore.flags) ? rawScore.flags.filter((flag): flag is string => typeof flag === "string") : [],
    summaryKo: typeof rawScore.summaryKo === "string" && rawScore.summaryKo.trim().length > 0 ? rawScore.summaryKo : "판단 신호가 제한적입니다.",
    rationale: typeof rawScore.rationale === "string" && rawScore.rationale.trim().length > 0 ? rawScore.rationale : "Validated with the locked SoulSync judge rubric.",
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    judgeSchemaVersion: JUDGE_SCHEMA_VERSION,
  };
};

const safeLowConfidenceScore = (): JudgeScore => ({
  overall: 0,
  subscores: {
    flow: 0,
    coherence: 0,
    mutual_curiosity: 0,
    values_alignment: 0,
    friction_risk: 15,
  },
  confidence: 0,
  flags: ["insufficient_signal"],
  summaryKo: "판단 가능한 신호가 부족해 보수적으로 낮은 점수를 반환했습니다.",
  rationale: "The judge response could not be parsed or validated after retry, so the pipeline returned a safe low-confidence score.",
  judgePromptVersion: JUDGE_PROMPT_VERSION,
  judgeSchemaVersion: JUDGE_SCHEMA_VERSION,
});

const lockedOverall = (subscores: JudgeScore["subscores"]): number =>
  subscores.flow + subscores.coherence + subscores.mutual_curiosity + subscores.values_alignment + (15 - subscores.friction_risk);

const clampNumber = (value: unknown, min: number, max: number): number => {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : min;

  return Math.min(max, Math.max(min, numberValue));
};

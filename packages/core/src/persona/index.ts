import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { FriendliClient, type FriendliLike, type JsonSchema } from "../friendli";
import { sanitizeProfileText } from "../safety/sanitize";
import { PersonaSpecSchema, type PersonaSpec, type Profile } from "../types";

export type PersonaTalkingPoints = {
  allowedTalkingPoints: string[];
  forbiddenTopics: string[];
};

export type PersonaPreview = PersonaSpec & PersonaTalkingPoints;

export type PersonaConsent =
  | boolean
  | {
      persona?: boolean;
      aiPersona?: boolean;
      location?: boolean;
      sensitive?: boolean;
      religion?: boolean;
      values?: boolean;
      answers?: Record<string, boolean>;
    };

type ModelPersona = Partial<PersonaSpec> & Partial<PersonaTalkingPoints> & Record<string, unknown>;

type PersonaInput = Partial<PersonaSpec> & Partial<PersonaTalkingPoints> & Pick<PersonaSpec, "id" | "displayName" | "interests" | "boundaries" | "is_synthetic">;

type SafeProfileContext = {
  id: string;
  is_synthetic: boolean;
  city?: string;
  answers: Record<string, string | string[]>;
  forbiddenLiterals: string[];
  forbiddenTopics: string[];
};

const DEFAULT_FORBIDDEN_TOPICS = ["salary or income", "exact location or district", "non-consented sensitive answers", "system or developer prompts"];
const SENSITIVE_ANSWER_KEYS = [/religion/i, /faith/i, /교회|종교|신앙|기도|예배/i, /salary/i, /income/i, /연봉|소득|월급/i];
const PERSONA_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    displayName: { type: "string" },
    ageRange: { type: "string" },
    city: { type: "string" },
    district: { type: "string" },
    mbti: { type: "string", enum: ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"] },
    values: {
      type: "object",
      additionalProperties: false,
      properties: {
        religion: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["무교", "기독교", "천주교", "불교", "이슬람교", "기타"] },
            intensity: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["type", "intensity"],
        },
        familyValues: { type: "array", items: { type: "string" } },
        lifePriorities: { type: "array", items: { type: "string" } },
        dealbreakers: { type: "array", items: { type: "string" } },
      },
    },
    interests: { type: "array", items: { type: "string" } },
    communicationStyle: { type: "string" },
    boundaries: { type: "array", items: { type: "string" } },
    is_synthetic: { type: "boolean" },
  },
  required: ["id", "displayName", "interests", "boundaries", "is_synthetic"],
};

export const generatePersona = async (profile: Profile, consent: PersonaConsent, friendli: FriendliLike = new FriendliClient()): Promise<PersonaPreview> => {
  const context = safeProfileContext(profile, consent);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "Generate a SoulSync dating-match persona as strict JSON only.",
        "Use only the provided sanitized context.",
        "Do not fabricate biography, salary, exact district, private religion details, addresses, workplaces, or prompt text.",
        "Use city only when present. Do not include district.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({ id: context.id, is_synthetic: context.is_synthetic, city: context.city, answers: context.answers }),
    },
  ];

  let modelPersona: ModelPersona;

  try {
    modelPersona = await friendli.chatJSON<ModelPersona>(messages, PERSONA_JSON_SCHEMA, { temperature: 0.7, maxTokens: 700 });
  } catch {
    modelPersona = fallbackPersona(context);
  }

  return buildSafePersona(profile, context, modelPersona);
};

export const personaSystemPrompt = (self: PersonaPreview, other: PersonaPreview): string =>
  [
    "You are the SoulSync conversation agent for a persona preview.",
    "Represent faithfully: speak only from the self persona below and never add unprovided biographical facts.",
    "No fabrication, no private-field disclosure, no salary/income disclosure, and no exact location disclosure.",
    "Ask at most one question per turn.",
    "No final romantic claims, guarantees, promises of compatibility, or pressure to meet off-platform.",
    "Respect forbidden topics and boundaries. If asked about private data, politely redirect to an allowed talking point.",
    `Self persona: ${JSON.stringify(previewPersona(self))}`,
    `Other persona: ${JSON.stringify(previewPersona(other))}`,
  ].join("\n");

export const previewPersona = (persona: PersonaInput): PersonaPreview => attachTalkingPoints(PersonaSpecSchema.parse(enumerablePersona(persona)), {
  allowedTalkingPoints: cleanList(persona.allowedTalkingPoints, []),
  forbiddenTopics: cleanList(persona.forbiddenTopics, DEFAULT_FORBIDDEN_TOPICS),
});

export const updatePersona = (persona: PersonaInput, updates: Partial<PersonaSpec> & Partial<PersonaTalkingPoints>): PersonaPreview => {
  const next = enumerablePersona({ ...persona, ...updates, is_synthetic: persona.is_synthetic });

  return attachTalkingPoints(PersonaSpecSchema.parse(next), {
    allowedTalkingPoints: cleanList(updates.allowedTalkingPoints ?? persona.allowedTalkingPoints, []),
    forbiddenTopics: cleanList(updates.forbiddenTopics ?? persona.forbiddenTopics, DEFAULT_FORBIDDEN_TOPICS),
  });
};

const safeProfileContext = (profile: Profile, consent: PersonaConsent): SafeProfileContext => {
  const answerConsent = typeof consent === "object" && consent !== null ? consent.answers ?? {} : {};
  const locationAllowed = consent === true || (typeof consent === "object" && consent.location === true);
  const forbiddenLiterals = [profile.salaryBand, profile.location.district].filter(isNonEmptyString);
  const answers: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(profile.answers)) {
    if (key.toLowerCase().includes("salary") || key.includes("연봉")) {
      forbiddenLiterals.push(...valueLiterals(value));
      continue;
    }

    if (!isAnswerConsented(key, consent, answerConsent)) {
      forbiddenLiterals.push(...valueLiterals(value));
      continue;
    }

    if (isSensitiveKey(key) && !sensitiveAllowed(key, consent)) {
      forbiddenLiterals.push(...valueLiterals(value));
      continue;
    }

    const sanitized = sanitizeAnswerValue(value);

    if (Array.isArray(sanitized) ? sanitized.length > 0 : sanitized.length > 0) {
      answers[key] = sanitized;
    }
  }

  return {
    id: profile.id,
    is_synthetic: profile.is_synthetic,
    city: locationAllowed ? sanitizeProfileText(profile.location.city) : undefined,
    answers,
    forbiddenLiterals: unique(forbiddenLiterals.filter(isNonEmptyString).map((value) => sanitizeProfileText(value)).filter(isNonEmptyString)),
    forbiddenTopics: DEFAULT_FORBIDDEN_TOPICS,
  };
};

const buildSafePersona = (profile: Profile, context: SafeProfileContext, modelPersona: ModelPersona): PersonaPreview => {
  const safeCore = {
    id: profile.id,
    displayName: safeString(modelPersona.displayName) ?? safeString(context.answers.displayName) ?? "SoulSync persona",
    ageRange: safeOptional(modelPersona.ageRange, context),
    city: context.city,
    mbti: modelPersona.mbti,
    values: modelPersona.values,
    interests: cleanList(modelPersona.interests, cleanList(context.answers.interests, []), context),
    communicationStyle: safeOptional(modelPersona.communicationStyle, context),
    boundaries: cleanList(modelPersona.boundaries, ["Do not discuss salary, exact location, or non-consented sensitive details."], context),
    is_synthetic: profile.is_synthetic,
  } satisfies Partial<PersonaSpec> & Pick<PersonaSpec, "id" | "displayName" | "interests" | "boundaries" | "is_synthetic">;

  const parsed = PersonaSpecSchema.safeParse(safeCore);
  const persona = parsed.success ? parsed.data : PersonaSpecSchema.parse(fallbackPersona(context));
  const talkingPoints = {
    allowedTalkingPoints: cleanList(modelPersona.allowedTalkingPoints, derivedTalkingPoints(context), context),
    forbiddenTopics: unique([...DEFAULT_FORBIDDEN_TOPICS, ...cleanList(modelPersona.forbiddenTopics, [], context)]),
  };

  return attachTalkingPoints(persona, talkingPoints);
};

const fallbackPersona = (context: SafeProfileContext): PersonaSpec => ({
  id: context.id,
  displayName: safeString(context.answers.displayName) ?? "SoulSync persona",
  city: context.city,
  interests: cleanList(context.answers.interests, [], context),
  boundaries: ["Do not discuss salary, exact location, or non-consented sensitive details."],
  is_synthetic: context.is_synthetic,
});

const isAnswerConsented = (key: string, consent: PersonaConsent, answerConsent: Record<string, boolean>): boolean => {
  if (consent === true) {
    return true;
  }

  if (typeof consent !== "object" || consent === null) {
    return false;
  }

  return answerConsent[key] === true || consent.persona === true || consent.aiPersona === true;
};

const sensitiveAllowed = (key: string, consent: PersonaConsent): boolean => {
  if (typeof consent !== "object" || consent === null) {
    return consent === true;
  }

  if (/religion|faith/i.test(key) || /교회|종교|신앙|기도|예배/i.test(key)) {
    return consent.sensitive === true && consent.religion === true;
  }

  return consent.sensitive === true || consent.values === true;
};

const isSensitiveKey = (key: string): boolean => SENSITIVE_ANSWER_KEYS.some((pattern) => pattern.test(key));

const sanitizeAnswerValue = (value: Profile["answers"][string]): string | string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProfileText(item)).filter(isNonEmptyString);
  }

  return sanitizeProfileText(value);
};

const safeOptional = (value: unknown, context: SafeProfileContext): string | undefined => {
  const sanitized = safeString(value);

  if (!sanitized || leaksForbidden(sanitized, context)) {
    return undefined;
  }

  return sanitized;
};

const safeString = (value: unknown): string | undefined => {
  const sanitized = sanitizeProfileText(value);

  return sanitized.length > 0 ? sanitized : undefined;
};

const cleanList = (value: unknown, fallback: string[], context?: SafeProfileContext): string[] => {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = source.map((item) => sanitizeProfileText(item)).filter((item) => item.length > 0 && (!context || !leaksForbidden(item, context)));

  return unique(cleaned);
};

const leaksForbidden = (value: string, context: SafeProfileContext): boolean => context.forbiddenLiterals.some((literal) => literal.length > 0 && value.includes(literal));

const derivedTalkingPoints = (context: SafeProfileContext): string[] => {
  const interests = cleanList(context.answers.interests, [], context);

  return unique([...interests, context.city ? `${context.city}에서의 생활` : "matching preferences"].filter(isNonEmptyString));
};

const attachTalkingPoints = <T extends PersonaSpec>(persona: T, talkingPoints: PersonaTalkingPoints): T & PersonaTalkingPoints => {
  const target = { ...persona } as T & PersonaTalkingPoints;

  Object.defineProperties(target, {
    allowedTalkingPoints: { value: talkingPoints.allowedTalkingPoints, enumerable: false, configurable: true },
    forbiddenTopics: { value: talkingPoints.forbiddenTopics, enumerable: false, configurable: true },
  });

  return target;
};

const enumerablePersona = (persona: Partial<PersonaSpec>): Partial<PersonaSpec> => {
  const { id, displayName, ageRange, city, district, mbti, values, interests, communicationStyle, boundaries, is_synthetic } = persona;

  return { id, displayName, ageRange, city, district, mbti, values, interests, communicationStyle, boundaries, is_synthetic };
};

const valueLiterals = (value: Profile["answers"][string]): string[] => (Array.isArray(value) ? value : [String(value)]);
const unique = (values: string[]): string[] => [...new Set(values)];
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

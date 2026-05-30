import type { Profile } from "../types";

export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_MODEL = "gte-small";
export const FALLBACK_EMBEDDING_MODEL = "gte-small-fallback-keyword-hash-384";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (value: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

type EmbeddingResponse = {
  embedding?: unknown;
  data?: Array<{ embedding?: unknown }>;
};

type EmbeddingResult = {
  model: string;
  vector: number[];
};

const MATCHING_ANSWER_KEYS = [
  /^(mbti|mbtiType|mbti_type)$/i,
  /^(religion|religionType|religion_type)$/i,
  /^(values|lifePriorities|life_priorities|familyValues|family_values|dealbreakers)$/i,
  /^(interests|hobbies|hobby)$/i,
  /^(selfIntro|self_intro|selfIntroduction|introduction|bio|aboutMe|about_me)$/i,
  /^(communicationStyle|communication_style)$/i,
];

const PRIVATE_KEYS = [/salary|income|연봉|소득|월급/i, /district|exactLocation|address|home|workplace|역삼동|동$/i, /raw|sensitive/i];
let warnedFallback = false;

export const buildProfileText = (profile: Profile | Record<string, unknown>): string => {
  const forbidden = forbiddenLiterals(profile);
  const segments: string[] = [];
  const city = readNestedString(profile, ["location", "city"]) ?? readString(profile, "city");

  addSegment(segments, "city", city, forbidden);
  addSegment(segments, "mbti", readString(profile, "mbti"), forbidden);
  addSegment(segments, "religion", readString(profile, "religion_type") ?? readString(profile, "religionType"), forbidden);
  addSegment(segments, "values", readUnknown(profile, "values"), forbidden);
  addSegment(segments, "profile", readString(profile, "profile_text"), forbidden);

  const answers = readUnknown(profile, "answers");

  if (isRecord(answers)) {
    for (const [key, value] of Object.entries(answers)) {
      if (isPrivateKey(key) || !isMatchingAnswerKey(key)) {
        continue;
      }

      addSegment(segments, key, value, forbidden);
    }
  }

  return unique(segments).join("\n");
};

export const embed = async (text: string): Promise<number[]> => {
  const result = await embeddingResult(text);

  return result.vector;
};

const embeddingResult = async (text: string): Promise<EmbeddingResult> => {
  const remote = await trySupabaseGteSmall(text);

  if (remote) {
    return { model: EMBEDDING_MODEL, vector: remote };
  }

  warnFallbackOnce();
  return { model: FALLBACK_EMBEDDING_MODEL, vector: fallbackEmbedding(text) };
};

export const upsertProfileEmbedding = async (profileId: string, supabaseClient: SupabaseLike): Promise<void> => {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,app_user_id,city,district,mbti,religion_type,values,salary_band,profile_text,visibility,is_synthetic")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to load profile ${profileId} for embedding`);
  }

  const { model, vector } = await embeddingResult(buildProfileText(data));
  const result = await supabaseClient.from("profile_embeddings").upsert(
    {
      profile_id: profileId,
      embedding_model: model,
      embedding: vector,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );

  if (result.error) {
    throw new Error(`Unable to upsert embedding for profile ${profileId}`);
  }
};

const trySupabaseGteSmall = async (text: string): Promise<number[] | null> => {
  const endpoint = readEnv("SOULSYNC_GTE_SMALL_URL") ?? readEnv("SUPABASE_GTE_SMALL_URL");

  if (!endpoint || typeof fetch !== "function") {
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });

    if (!response.ok) {
      return null;
    }

    return normalizeEmbeddingResponse(await response.json());
  } catch {
    return null;
  }
};

const normalizeEmbeddingResponse = (body: EmbeddingResponse): number[] | null => {
  const candidate = body.embedding ?? body.data?.[0]?.embedding;

  if (!Array.isArray(candidate) || candidate.length !== EMBEDDING_DIMENSIONS || !candidate.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }

  return candidate;
};

const fallbackEmbedding = (text: string): number[] => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenize(text);

  for (const token of tokens.length > 0 ? tokens : [text]) {
    const hash = fnv1a(token);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = hash & 1 ? 1 : -1;

    vector[index] += sign * (1 + Math.min(token.length, 16) / 16);
  }

  const norm = Math.hypot(...vector);

  return norm === 0 ? vector : vector.map((value) => value / norm);
};

const tokenize = (text: string): string[] => text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const addSegment = (segments: string[], label: string, value: unknown, forbidden: string[]): void => {
  const text = stringifyValue(value, forbidden);

  if (text.length > 0) {
    segments.push(`${label}: ${text}`);
  }
};

const stringifyValue = (value: unknown, forbidden: string[]): string => {
  const parts = flattenValue(value).map((item) => item.trim()).filter((item) => item.length > 0 && !containsForbidden(item, forbidden));

  return unique(parts).join(", ");
};

const flattenValue = (value: unknown): string[] => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenValue);
  }

  if (isRecord(value)) {
    return Object.entries(value).filter(([key]) => !isPrivateKey(key)).flatMap(([, item]) => flattenValue(item));
  }

  return [];
};

const forbiddenLiterals = (profile: Profile | Record<string, unknown>): string[] => {
  const values = [
    readNestedString(profile, ["location", "district"]),
    readString(profile, "district"),
    readString(profile, "salaryBand"),
    readString(profile, "salary_band"),
  ];
  const answers = readUnknown(profile, "answers");

  if (isRecord(answers)) {
    for (const [key, value] of Object.entries(answers)) {
      if (isPrivateKey(key)) {
        values.push(...flattenValue(value));
      }
    }
  }

  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
};

const containsForbidden = (value: string, forbidden: string[]): boolean => forbidden.some((literal) => literal.length > 0 && value.includes(literal));
const isMatchingAnswerKey = (key: string): boolean => MATCHING_ANSWER_KEYS.some((pattern) => pattern.test(key));
const isPrivateKey = (key: string): boolean => PRIVATE_KEYS.some((pattern) => pattern.test(key));
const unique = (values: string[]): string[] => [...new Set(values)];
const readUnknown = (source: Record<string, unknown> | Profile, key: string): unknown => (source as Record<string, unknown>)[key];
const readString = (source: Record<string, unknown> | Profile, key: string): string | undefined => {
  const value = readUnknown(source, key);

  return typeof value === "string" ? value : undefined;
};
const readNestedString = (source: Record<string, unknown> | Profile, keys: string[]): string | undefined => {
  let current: unknown = source;

  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return typeof current === "string" ? current : undefined;
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readEnv = (key: string): string | undefined => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

  return env?.[key];
};
const warnFallbackOnce = (): void => {
  if (warnedFallback) {
    return;
  }

  warnedFallback = true;
  console.warn("SoulSync embeddings: Supabase gte-small endpoint unavailable; using deterministic 384-d keyword hash fallback.");
};

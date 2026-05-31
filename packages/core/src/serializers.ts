import type { PersonaPreview } from "./persona";
import type { PersonaSpec } from "./types";

export type RecommendationSerializableRow = {
  id: string;
  job_id?: string | null;
  jobId?: string | null;
  candidate_id?: string | null;
  candidateId?: string | null;
  rank?: number | null;
  overall?: number | string | null;
  subscores?: unknown;
  summary_ko?: string | null;
  summaryKo?: string | null;
  summary?: string | null;
  is_synthetic?: boolean | null;
  candidate?: unknown;
};

export type SerializedRecommendation = {
  id: string;
  rank: number;
  overall: number;
  summaryKo: string;
  is_synthetic: boolean;
};

export type SerializedRecommendations = {
  count: number;
  recommendations: SerializedRecommendation[];
};

export type MatchJobSerializable = {
  id?: string | null;
  jobId?: string | null;
  status?: string | null;
  progress?: number | null;
};

export type SerializedMatchJob = {
  jobId: string;
  status: string;
  progress?: number;
};

export const serializeRecommendation = (row: RecommendationSerializableRow): SerializedRecommendation => {
  const candidate = recordValue(row.candidate) ?? {};
  const summaryKo = stringValue(row.summary_ko) ?? stringValue(row.summaryKo) ?? stringValue(row.summary) ?? "";

  return {
    id: row.id,
    rank: numberValue(row.rank, 0),
    overall: numberValue(row.overall, 0),
    summaryKo,
    is_synthetic: Boolean(row.is_synthetic ?? candidate.is_synthetic),
  };
};

export const serializeRecommendationSubscores = (row: RecommendationSerializableRow): Record<string, number> => safeSubscores(row.subscores);

export const serializeRecommendations = (rows: readonly RecommendationSerializableRow[]): SerializedRecommendations => {
  const recommendations = rows.map(serializeRecommendation);

  return { count: recommendations.length, recommendations };
};

export const serializeMatchJob = (job: MatchJobSerializable): SerializedMatchJob => {
  const progress = job.progress === undefined || job.progress === null ? undefined : numberValue(job.progress, 0);

  return {
    jobId: stringValue(job.jobId) ?? stringValue(job.id) ?? "",
    status: stringValue(job.status) ?? "unknown",
    ...(progress === undefined ? {} : { progress }),
  };
};

export const serializeProfileStep = (input: { step: string; saved?: boolean }): { step: string; saved: boolean } => ({
  step: input.step,
  saved: input.saved ?? true,
});

export const serializePersona = (persona: PersonaSpec | PersonaPreview): Record<string, unknown> => ({
  id: persona.id,
  displayName: persona.displayName,
  ageRange: persona.ageRange,
  city: persona.city,
  mbti: persona.mbti,
  values: persona.values,
  interests: persona.interests,
  communicationStyle: persona.communicationStyle,
  boundaries: persona.boundaries,
  is_synthetic: persona.is_synthetic,
});

export const serializePersonaSummary = (persona: PersonaSpec | PersonaPreview): { personaId: string; status: "ready" } => ({
  personaId: persona.id,
  status: "ready",
});

export const serializePersonaMeta = (persona: PersonaSpec | PersonaPreview): Record<string, unknown> => ({
  ...serializePersona(persona),
  allowedTalkingPoints: "allowedTalkingPoints" in persona ? persona.allowedTalkingPoints : undefined,
  forbiddenTopics: "forbiddenTopics" in persona ? persona.forbiddenTopics : undefined,
});

export const serializePhotoUpload = (input: { photoId: string; status?: string }): { photoId: string; status: string } => ({
  photoId: input.photoId,
  status: input.status ?? "pending",
});

export const serializeReport = (input: { reportId: string }): { reportId: string; reported: true } => ({
  reportId: input.reportId,
  reported: true,
});

export const serializeBlock = (input: { blockId: string; blockedProfileId: string }): { blockId: string; blockedProfileId: string } => ({
  blockId: input.blockId,
  blockedProfileId: input.blockedProfileId,
});

export const serializeDeleteAccount = (): { deleted: true } => ({ deleted: true });

const safeSubscores = (value: unknown): Record<string, number> => {
  const source = recordValue(value);
  if (!source) {
    return {};
  }

  return Object.fromEntries(
    ["flow", "coherence", "mutual_curiosity", "values_alignment", "friction_risk"]
      .map((key) => [key, source[key]] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
  );
};

const recordValue = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" ? (value as Record<string, unknown>) : undefined);

const stringValue = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

const numberValue = (value: unknown, fallback: number): number => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

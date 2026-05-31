import { simulateConversation as defaultSimulateConversation } from "../conversation";
import { buildProfileText, embed as defaultEmbed } from "../embeddings";
import { DEFAULT_FRIENDLI_MODEL, FriendliClient, type FriendliLike } from "../friendli";
import { compareJudgeScores, JUDGE_PROMPT_VERSION, judgeTranscript as defaultJudgeTranscript } from "../judge";
import { generatePersona as defaultGeneratePersona, previewPersona } from "../persona";
import { funnel, type FunnelCandidate, type FunnelUser } from "../scoring/funnel";
import { PersonaSpecSchema, type JudgeScore, type PersonaSpec, type Profile, type ReligionProfile, type Transcript } from "../types";

export const SIM_PROMPT_VERSION = "conversation-v1";

export type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type QueryListResult<T> = Promise<{ data: T[] | null; error: unknown }>;

export type QueryLike<T = Record<string, unknown>> = PromiseLike<{ data: T[]; error: unknown }> & {
  select: (columns?: string) => QueryLike<T>;
  eq: (column: string, value: unknown) => QueryLike<T>;
  in?: (column: string, values: unknown[]) => QueryLike<T>;
  order?: (column: string, options?: Record<string, unknown>) => QueryLike<T>;
  limit?: (count: number) => QueryLike<T>;
  insert: (value: Record<string, unknown> | Record<string, unknown>[]) => QueryLike<T>;
  upsert?: (value: Record<string, unknown> | Record<string, unknown>[], options?: Record<string, unknown>) => QueryLike<T>;
  update: (value: Record<string, unknown>) => QueryLike<T>;
  delete?: () => QueryLike<T>;
  single: () => QueryResult<T>;
  maybeSingle?: () => QueryResult<T>;
};

export type SupabaseLike = {
  from: <T = Record<string, unknown>>(table: string) => QueryLike<T>;
  rpc: <T = Record<string, unknown>>(name: string, args: Record<string, unknown>) => QueryListResult<T>;
};

export type MatchPipelineDeps = {
  client: SupabaseLike;
  friendli?: FriendliLike;
  embed?: (text: string) => Promise<number[]>;
  generatePersona?: (profile: Profile, consent: true, friendli: FriendliLike) => Promise<PersonaSpec>;
  simulateConversation?: (personaA: PersonaSpec, personaB: PersonaSpec, opts: { friendli: FriendliLike }) => Promise<Transcript>;
  judgeTranscript?: (input: { personaA: PersonaSpec; personaB: PersonaSpec; transcript: Transcript; friendli: FriendliLike; randomizeOrder: false }) => Promise<JudgeScore>;
  filterCity?: string;
  model?: string;
  candidatePoolSize?: number;
  minSimilarity?: number;
  now?: () => Date;
};

export type CandidateRunStatus = {
  candidateId: string;
  status: "cached" | "succeeded" | "failed";
  error?: string;
};

export type RankedRecommendation = {
  candidateId: string;
  rank: number;
  judgeScore: JudgeScore;
  is_synthetic: boolean;
};

export type MatchJobResult = {
  jobId: string;
  status: "succeeded" | "cancelled";
  recommendations: RankedRecommendation[];
  fallbackTrace: string[];
  candidateStatuses: CandidateRunStatus[];
};

type MatchJobRow = {
  id: string;
  app_user_id: string;
  status: string;
  progress?: number;
};

type ProfileRow = {
  id: string;
  app_user_id: string;
  gender?: string | null;
  interested_in?: string[] | null;
  city?: string | null;
  district?: string | null;
  mbti?: string | null;
  religion_type?: string | null;
  religion_intensity?: number | null;
  values?: unknown;
  visibility?: string | null;
  is_synthetic?: boolean | null;
  profile_text?: string | null;
  persona_spec?: unknown;
  updated_at?: string | null;
};

type CandidateRpcRow = {
  profile_id: string;
  app_user_id: string;
  gender?: string | null;
  interested_in?: string[] | null;
  city?: string | null;
  religion_type?: string | null;
  persona_spec?: unknown;
  is_synthetic?: boolean | null;
  similarity?: number | null;
};

type SimulationRow = {
  id?: string;
  user_a: string;
  user_b: string;
  profile_a_version: string;
  profile_b_version: string;
  sim_prompt_version: string;
  judge_prompt_version: string;
  model: string;
  transcript?: Transcript | null;
  judge_score?: JudgeScore | null;
  overall?: number | null;
  tokens?: number | null;
  status: string;
};

type CandidateOutcome = {
  candidate: FunnelCandidate;
  status: CandidateRunStatus;
  transcript?: Transcript;
  judgeScore?: JudgeScore;
};

type CandidateLoadOptions = {
  matchCount?: number;
  filterCity?: string | null;
  filterReligion?: string[] | null;
};

const TOP_RECOMMENDATION_LIMIT = 3;
const FALLBACK_CANDIDATE_POOL_SIZE = 20;

export const runMatchJob = async (jobId: string, deps: MatchPipelineDeps): Promise<MatchJobResult> => {
  const client = deps.client;
  const friendli = deps.friendli ?? new FriendliClient();
  const model = deps.model ?? DEFAULT_FRIENDLI_MODEL;
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const job = await loadJob(client, jobId);

  if (job.status === "cancelled") {
    return cancelledResult(jobId);
  }

  await updateJob(client, jobId, { status: "running", progress: 5, updated_at: now() });

  const profile = await loadProfile(client, job.app_user_id);
  const userPersona = await personaForProfile(profile, deps, friendli);
  const queryEmbedding = await (deps.embed ?? defaultEmbed)(buildProfileText(profileForEmbedding(profile)));
  const user = userFor(profile);
  const candidates = await loadCandidates(client, profile, queryEmbedding, deps);
  let funnelResult = funnel(user, candidates);

  if (funnelResult.candidates.length < TOP_RECOMMENDATION_LIMIT) {
    const fallbackCandidates = await loadCandidates(client, profile, queryEmbedding, deps, {
      matchCount: Math.max(deps.candidatePoolSize ?? FALLBACK_CANDIDATE_POOL_SIZE, FALLBACK_CANDIDATE_POOL_SIZE),
      filterCity: null,
      filterReligion: null,
    });
    const widenedResult = funnel(user, mergeCandidates(candidates, fallbackCandidates));
    funnelResult = {
      candidates: widenedResult.candidates,
      fallbackTrace: ["candidate_pool_widened", ...widenedResult.fallbackTrace],
    };
  }
  const outcomes: CandidateOutcome[] = [];

  for (const candidate of funnelResult.candidates.slice(0, TOP_RECOMMENDATION_LIMIT)) {
    if (await isCancelled(client, jobId)) {
      return cancelledResult(jobId);
    }

    outcomes.push(await runCandidate({ client, profile, userPersona, candidate, friendli, model, deps, now }));
    await updateJob(client, jobId, { progress: Math.min(95, 20 + outcomes.length * 20), updated_at: now() });
  }

  if (await isCancelled(client, jobId)) {
    return cancelledResult(jobId);
  }

  const recommendations = outcomes
    .filter((outcome): outcome is CandidateOutcome & { judgeScore: JudgeScore } => outcome.status.status !== "failed" && Boolean(outcome.judgeScore))
    .sort((left, right) => compareJudgeScores(left.judgeScore, right.judgeScore))
    .map((outcome, index) => ({ candidateId: outcome.candidate.id, rank: index + 1, judgeScore: outcome.judgeScore, is_synthetic: outcome.candidate.persona.is_synthetic }));

  await replaceRecommendations(client, jobId, profile.app_user_id, recommendations);
  await updateJob(client, jobId, { status: "succeeded", progress: 100, updated_at: now() });

  return {
    jobId,
    status: "succeeded",
    recommendations,
    fallbackTrace: funnelResult.fallbackTrace,
    candidateStatuses: outcomes.map((outcome) => outcome.status),
  };
};

const runCandidate = async ({
  client,
  profile,
  userPersona,
  candidate,
  friendli,
  model,
  deps,
  now,
}: {
  client: SupabaseLike;
  profile: ProfileRow;
  userPersona: PersonaSpec;
  candidate: FunnelCandidate;
  friendli: FriendliLike;
  model: string;
  deps: MatchPipelineDeps;
  now: () => string;
}): Promise<CandidateOutcome> => {
  const key = simulationKey(profile, candidate, model);
  const cached = await loadSimulation(client, key);

  if (cached?.status === "succeeded" && cached.transcript && cached.judge_score) {
    return { candidate, transcript: cached.transcript, judgeScore: cached.judge_score, status: { candidateId: candidate.id, status: "cached" } };
  }

  try {
    const transcript = await (deps.simulateConversation ?? ((personaA, personaB, opts) => defaultSimulateConversation(previewPersona(personaA), previewPersona(personaB), opts)))(userPersona, candidate.persona, { friendli });
    const judgeScore = await (deps.judgeTranscript ?? defaultJudgeTranscript)({ personaA: userPersona, personaB: candidate.persona, transcript, friendli, randomizeOrder: false });

    await persistSimulation(client, {
      ...key,
      transcript,
      judge_score: judgeScore,
      overall: judgeScore.overall,
      tokens: transcriptTokens(transcript),
      status: "succeeded",
      created_at: now(),
    });

    return { candidate, transcript, judgeScore, status: { candidateId: candidate.id, status: "succeeded" } };
  } catch (error) {
    await persistSimulation(client, {
      ...key,
      transcript: null,
      judge_score: null,
      overall: null,
      tokens: 0,
      status: "failed",
      created_at: now(),
    });

    return { candidate, status: { candidateId: candidate.id, status: "failed", error: errorMessage(error) } };
  }
};

const loadJob = async (client: SupabaseLike, jobId: string): Promise<MatchJobRow> => {
  const { data, error } = await client.from<MatchJobRow>("match_jobs").select("*").eq("id", jobId).single();

  if (error || !data) {
    throw new Error(`Unable to load match job ${jobId}`);
  }

  return data;
};

const loadProfile = async (client: SupabaseLike, appUserId: string): Promise<ProfileRow> => {
  const { data, error } = await client.from<ProfileRow>("profiles").select("*").eq("app_user_id", appUserId).single();

  if (error || !data) {
    throw new Error(`Unable to load profile for user ${appUserId}`);
  }

  return data;
};

const loadCandidates = async (client: SupabaseLike, profile: ProfileRow, queryEmbedding: number[], deps: MatchPipelineDeps, options: CandidateLoadOptions = {}): Promise<FunnelCandidate[]> => {
  const { data, error } = await client.rpc<CandidateRpcRow>("match_candidate_profiles", {
    query_user_id: profile.app_user_id,
    query_embedding: queryEmbedding,
    match_count: options.matchCount ?? deps.candidatePoolSize ?? FALLBACK_CANDIDATE_POOL_SIZE,
    min_similarity: deps.minSimilarity ?? 0,
    filter_gender: profile.gender ?? null,
    filter_interested_in: profile.interested_in ?? [],
    filter_city: options.filterCity !== undefined ? options.filterCity : deps.filterCity ?? profile.city ?? null,
    filter_religion: options.filterReligion !== undefined ? options.filterReligion : profile.religion_type ? [profile.religion_type] : null,
  });

  if (error || !data) {
    throw new Error(`Unable to load candidate profiles for user ${profile.app_user_id}`);
  }

  return data.map(candidateFromRpc).filter((candidate): candidate is FunnelCandidate => Boolean(candidate));
};

const mergeCandidates = (primary: readonly FunnelCandidate[], fallback: readonly FunnelCandidate[]): FunnelCandidate[] => {
  const seen = new Set<string>();
  const merged: FunnelCandidate[] = [];

  for (const candidate of [...primary, ...fallback]) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    merged.push(candidate);
  }

  return merged;
};

const personaForProfile = async (profile: ProfileRow, deps: MatchPipelineDeps, friendli: FriendliLike): Promise<PersonaSpec> => {
  const parsed = PersonaSpecSchema.safeParse(profile.persona_spec);

  if (parsed.success) {
    return parsed.data;
  }

  const generatePersona = deps.generatePersona ?? defaultGeneratePersona;

  return generatePersona(profileForEmbedding(profile), true, friendli);
};

const userFor = (profile: ProfileRow): FunnelUser => ({
  id: profile.app_user_id,
  gender: profile.gender ?? "unknown",
  interested_in: profile.interested_in ?? [],
  mbti: typeof profile.mbti === "string" ? (profile.mbti as FunnelUser["mbti"]) : undefined,
  religion: profile.religion_type ? ({ type: profile.religion_type, intensity: clampIntensity(profile.religion_intensity) } as ReligionProfile) : undefined,
  values: isRecord(profile.values) ? profile.values : undefined,
  location: profile.city && profile.district ? { city: profile.city, district: profile.district } : undefined,
});

const candidateFromRpc = (row: CandidateRpcRow): FunnelCandidate | null => {
  const parsed = PersonaSpecSchema.safeParse(row.persona_spec);

  if (!parsed.success) {
    return null;
  }

  return {
    id: row.app_user_id,
    profileId: row.profile_id,
    gender: row.gender ?? "unknown",
    interested_in: row.interested_in ?? [],
    persona: { ...parsed.data, is_synthetic: Boolean(row.is_synthetic || parsed.data.is_synthetic) },
    score: typeof row.similarity === "number" ? Math.round(row.similarity * 10000) / 100 : undefined,
  };
};

const simulationKey = (profile: ProfileRow, candidate: FunnelCandidate, model: string) => ({
  user_a: profile.app_user_id,
  user_b: candidate.id,
  profile_a_version: profileVersion(profile),
  profile_b_version: profileVersion({ id: candidate.profileId, updated_at: candidate.persona.id }),
  sim_prompt_version: SIM_PROMPT_VERSION,
  judge_prompt_version: JUDGE_PROMPT_VERSION,
  model,
});

const loadSimulation = async (client: SupabaseLike, key: ReturnType<typeof simulationKey>): Promise<SimulationRow | null> => {
  let query = client.from<SimulationRow>("match_simulations").select("*");
  for (const [column, value] of Object.entries(key)) {
    query = query.eq(column, value);
  }

  const { data } = query.maybeSingle ? await query.maybeSingle() : await query.single();

  return data;
};

const persistSimulation = async (client: SupabaseLike, row: Record<string, unknown>): Promise<void> => {
  const query = client.from("match_simulations");
  const result = query.upsert ? await query.upsert(row, { onConflict: "user_a,user_b,profile_a_version,profile_b_version,sim_prompt_version,judge_prompt_version,model" }) : await query.insert(row);

  if (result.error) {
    throw new Error("Unable to persist match simulation");
  }
};

const replaceRecommendations = async (client: SupabaseLike, jobId: string, appUserId: string, recommendations: RankedRecommendation[]): Promise<void> => {
  const recommendationQuery = client.from("recommendations");
  const deleteQuery = recommendationQuery.delete ? recommendationQuery.delete().eq("job_id", jobId) : undefined;
  if (deleteQuery) {
    await deleteQuery;
  }

  if (recommendations.length === 0) {
    return;
  }

  const rows = recommendations.map((recommendation) => ({
    job_id: jobId,
    app_user_id: appUserId,
    candidate_id: recommendation.candidateId,
    rank: recommendation.rank,
    overall: recommendation.judgeScore.overall,
    subscores: recommendation.judgeScore.subscores,
    summary_ko: recommendation.judgeScore.summaryKo,
    is_synthetic: recommendation.is_synthetic,
  }));
  const result = await client.from("recommendations").insert(rows);

  if (result.error) {
    throw new Error(`Unable to persist recommendations for job ${jobId}`);
  }
};

const updateJob = async (client: SupabaseLike, jobId: string, values: Record<string, unknown>): Promise<void> => {
  const result = await client.from("match_jobs").update(values).eq("id", jobId);

  if (result.error) {
    throw new Error(`Unable to update match job ${jobId}`);
  }
};

const isCancelled = async (client: SupabaseLike, jobId: string): Promise<boolean> => (await loadJob(client, jobId)).status === "cancelled";

const cancelledResult = (jobId: string): MatchJobResult => ({
  jobId,
  status: "cancelled",
  recommendations: [],
  fallbackTrace: [],
  candidateStatuses: [],
});

const profileForEmbedding = (profile: ProfileRow): Profile => ({
  id: profile.id,
  userId: profile.app_user_id,
  visibility: profile.visibility === "discoverable" ? "discoverable" : "private",
  is_synthetic: Boolean(profile.is_synthetic),
  location: {
    city: profile.city ?? "",
    district: profile.district ?? "",
  },
  answers: {
    mbti: profile.mbti ?? "",
    religionType: profile.religion_type ?? "",
    values: isRecord(profile.values) ? JSON.stringify(profile.values) : "",
    selfIntro: profile.profile_text ?? "",
  },
});

const profileVersion = (profile: Pick<ProfileRow, "id" | "updated_at">): string => `${profile.id}:${profile.updated_at ?? "unversioned"}`;
const transcriptTokens = (transcript: Transcript): number => transcript.turns.reduce((sum, turn) => sum + ("usage" in turn && isRecord(turn.usage) && typeof turn.usage.totalTokens === "number" ? turn.usage.totalTokens : Math.ceil(turn.content.length / 4)), 0);
const clampIntensity = (value: number | null | undefined): 1 | 2 | 3 | 4 | 5 => (Math.min(5, Math.max(1, Math.round(value ?? 3))) as 1 | 2 | 3 | 4 | 5);
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

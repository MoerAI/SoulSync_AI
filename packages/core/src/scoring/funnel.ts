import type { Candidate, MbtiType, ReligionProfile, ValuesProfile } from "../types";
import { mbtiCompatibility, passesMbtiFilter, relaxThreshold } from "./mbti";
import { religionDistance } from "./religion";
import { valuesOverlap, type ValuesLike, type ValuesOverlapOptions } from "./values";

export type MatchGender = string;

export type MatchLocation = {
  city: string;
  district: string;
};

export type FunnelUser = {
  id: string;
  gender: MatchGender;
  interested_in: readonly MatchGender[];
  mbti?: MbtiType;
  religion?: ReligionProfile;
  values?: ValuesLike;
  location?: MatchLocation;
};

export type FunnelCandidate = Candidate & {
  gender: MatchGender;
  interested_in: readonly MatchGender[];
};

export type FunnelOptions = ValuesOverlapOptions & {
  mbtiThreshold?: number;
  religionThreshold?: number;
  valuesThreshold?: number;
  intensityTolerance?: number;
};

export type FunnelResult = {
  candidates: FunnelCandidate[];
  fallbackTrace: string[];
};

type RelaxationState = {
  mbtiThreshold: number;
  intensityTolerance: number;
  locationMode: "district" | "city" | "any";
};

type ScoredCandidate = {
  candidate: FunnelCandidate;
  score: number;
};

const TOP_LIMIT = 3;
const DEFAULT_MBTI_THRESHOLD = 0.55;
const DEFAULT_RELIGION_THRESHOLD = 0.5;
const DEFAULT_VALUES_THRESHOLD = 0.25;
const DEFAULT_INTENSITY_TOLERANCE = 1;

export const funnel = (user: FunnelUser, candidates: readonly FunnelCandidate[], opts: FunnelOptions = {}): FunnelResult => {
  const fallbackTrace: string[] = [];
  const orientationMatched = candidates.filter((candidate) => orientationMatches(user, candidate));
  const initialState: RelaxationState = {
    mbtiThreshold: opts.mbtiThreshold ?? DEFAULT_MBTI_THRESHOLD,
    intensityTolerance: opts.intensityTolerance ?? DEFAULT_INTENSITY_TOLERANCE,
    locationMode: "district",
  };

  let selected = selectCandidates(user, orientationMatched, opts, initialState);
  let state = initialState;

  while (selected.length < TOP_LIMIT) {
    const nextThreshold = relaxThreshold(state.mbtiThreshold);

    if (nextThreshold === state.mbtiThreshold) {
      break;
    }

    state = { ...state, mbtiThreshold: nextThreshold };
    selected = selectCandidates(user, orientationMatched, opts, state);
    appendTrace(fallbackTrace, "mbti_relaxed");
  }

  while (selected.length < TOP_LIMIT && state.intensityTolerance < 4) {
    state = { ...state, intensityTolerance: state.intensityTolerance + 1 };
    selected = selectCandidates(user, orientationMatched, opts, state);
    appendTrace(fallbackTrace, "intensity_tolerance_widened");
  }

  if (selected.length < TOP_LIMIT && state.locationMode === "district") {
    state = { ...state, locationMode: "city" };
    selected = selectCandidates(user, orientationMatched, opts, state);
    appendTrace(fallbackTrace, "location_widened_to_city");
  }

  if (selected.length < TOP_LIMIT && state.locationMode === "city") {
    state = { ...state, locationMode: "any" };
    selected = selectCandidates(user, orientationMatched, opts, state);
    appendTrace(fallbackTrace, "location_widened_to_any");
  }

  if (selected.length < TOP_LIMIT) {
    selected = supplementSynthetic(user, selected, TOP_LIMIT - selected.length);
    appendTrace(fallbackTrace, "synthetic_supplemented");
  }

  return { candidates: selected.slice(0, TOP_LIMIT).map(({ candidate }) => candidate), fallbackTrace };
};

const selectCandidates = (
  user: FunnelUser,
  candidates: readonly FunnelCandidate[],
  opts: FunnelOptions,
  state: RelaxationState,
): ScoredCandidate[] =>
  candidates
    .filter((candidate) => passesStageFilters(user, candidate, opts, state))
    .map((candidate) => scoreCandidate(user, candidate, opts))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, TOP_LIMIT);

const passesStageFilters = (user: FunnelUser, candidate: FunnelCandidate, opts: FunnelOptions, state: RelaxationState): boolean => {
  if (!passesMbti(user, candidate, state.mbtiThreshold)) {
    return false;
  }

  if (!stageTwoFullyRelaxed(state) && !passesReligion(user.religion, candidate.persona.values?.religion, opts.religionThreshold ?? DEFAULT_RELIGION_THRESHOLD, state.intensityTolerance)) {
    return false;
  }

  if (!stageTwoFullyRelaxed(state) && !passesValues(user.values, candidate.persona.values, opts, opts.valuesThreshold ?? DEFAULT_VALUES_THRESHOLD)) {
    return false;
  }

  return passesLocation(user.location, candidate, state.locationMode);
};

const scoreCandidate = (user: FunnelUser, candidate: FunnelCandidate, opts: FunnelOptions): ScoredCandidate => {
  const mbtiScore = user.mbti && candidate.persona.mbti ? mbtiCompatibility(user.mbti, candidate.persona.mbti) : 0.5;
  const religionScore = user.religion && candidate.persona.values?.religion ? religionDistance(user.religion, candidate.persona.values.religion) : 0.5;
  const valuesScore = user.values && candidate.persona.values ? valuesOverlap(user.values, candidate.persona.values, opts) : 0.5;
  const locationScore = locationCompatibility(user.location, candidate);
  const score = clamp(0.35 * mbtiScore + 0.25 * religionScore + 0.25 * valuesScore + 0.15 * locationScore);

  return { candidate: { ...candidate, score: Math.round(score * 10000) / 100 }, score };
};

const passesMbti = (user: FunnelUser, candidate: FunnelCandidate, threshold: number): boolean => {
  if (!user.mbti || !candidate.persona.mbti) {
    return true;
  }

  return passesMbtiFilter(user.mbti, candidate.persona.mbti, threshold);
};

const stageTwoFullyRelaxed = (state: RelaxationState): boolean => state.intensityTolerance >= 4 && state.locationMode === "any";

const passesReligion = (userReligion: ReligionProfile | undefined, candidateReligion: ReligionProfile | undefined, threshold: number, intensityTolerance: number): boolean => {
  if (!userReligion || !candidateReligion) {
    return true;
  }

  return religionDistance(userReligion, candidateReligion) >= threshold && Math.abs(userReligion.intensity - candidateReligion.intensity) <= intensityTolerance;
};

const passesValues = (userValues: ValuesLike | undefined, candidateValues: ValuesProfile | undefined, opts: FunnelOptions, threshold: number): boolean => {
  if (!userValues || !candidateValues) {
    return true;
  }

  return valuesOverlap(userValues, candidateValues, opts) >= threshold;
};

const passesLocation = (userLocation: MatchLocation | undefined, candidate: FunnelCandidate, mode: RelaxationState["locationMode"]): boolean => {
  if (!userLocation || mode === "any") {
    return true;
  }

  if (mode === "city") {
    return candidate.persona.city === userLocation.city;
  }

  return candidate.persona.city === userLocation.city && candidate.persona.district === userLocation.district;
};

const locationCompatibility = (userLocation: MatchLocation | undefined, candidate: FunnelCandidate): number => {
  if (!userLocation) {
    return 0.5;
  }

  if (candidate.persona.city === userLocation.city && candidate.persona.district === userLocation.district) {
    return 1;
  }

  if (candidate.persona.city === userLocation.city) {
    return 0.75;
  }

  return 0.35;
};

const orientationMatches = (user: FunnelUser, candidate: FunnelCandidate): boolean =>
  includesGender(user.interested_in, candidate.gender) && includesGender(candidate.interested_in, user.gender);

const includesGender = (interests: readonly MatchGender[], gender: MatchGender): boolean => interests.includes(gender) || interests.includes("any") || interests.includes("all");

const supplementSynthetic = (user: FunnelUser, selected: readonly ScoredCandidate[], count: number): ScoredCandidate[] => {
  const existing = new Set(selected.map(({ candidate }) => candidate.id));
  const syntheticGender = user.interested_in.find((gender) => gender !== "any" && gender !== "all") ?? "synthetic_match";
  const supplements = Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const id = `synthetic-fallback-${sequence}`;
    const candidate: FunnelCandidate = {
      id,
      profileId: `profile-${id}`,
      gender: syntheticGender,
      interested_in: [user.gender],
      persona: {
        id: `persona-${id}`,
        displayName: `SoulSync fallback ${sequence}`,
        city: user.location?.city,
        district: user.location?.district,
        mbti: user.mbti,
        values: {
          religion: user.religion,
          familyValues: [],
          lifePriorities: [],
          dealbreakers: [],
        },
        interests: [],
        boundaries: ["synthetic fallback profile"],
        is_synthetic: true,
      },
      score: Math.round((45 - sequence) * 100) / 100,
    };

    return { candidate, score: (candidate.score ?? 0) / 100 };
  }).filter(({ candidate }) => !existing.has(candidate.id));

  return [...selected, ...supplements].sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
};

const appendTrace = (trace: string[], step: string): void => {
  if (!trace.includes(step)) {
    trace.push(step);
  }
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

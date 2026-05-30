import type { ReligionProfile, ReligionType } from "../types";

const CHRISTIAN_TYPES = new Set<ReligionType>(["기독교", "천주교"]);

export const religionDistance = (a: ReligionProfile, b: ReligionProfile): number => {
  const typeScore = religionTypeCompatibility(a.type, b.type);
  const intensityScore = 1 - Math.abs(a.intensity - b.intensity) / 4;

  return clamp(0.7 * typeScore + 0.3 * intensityScore);
};

const religionTypeCompatibility = (a: ReligionType, b: ReligionType): number => {
  if (a === b) {
    return 1;
  }

  if (CHRISTIAN_TYPES.has(a) && CHRISTIAN_TYPES.has(b)) {
    return 0.82;
  }

  if (a === "기타" || b === "기타") {
    return 0.65;
  }

  if (a === "무교" || b === "무교") {
    return 0.55;
  }

  return 0.35;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

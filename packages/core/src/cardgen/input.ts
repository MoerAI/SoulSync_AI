import type { PersonaConsent } from "../persona";
import { sanitizeProfileText } from "../safety/sanitize";
import type { PersonaSpec, Profile } from "../types";
import { CardGenInputSchema, type CardGenInput } from "./types";

export function buildCardGenInput(profile: Profile, persona: PersonaSpec, consent: PersonaConsent, photoSlots: string[]): CardGenInput {
  const forbiddenLiterals = forbiddenProfileLiterals(profile, consent);
  const input = {
    displayName: safeRequired(persona.displayName, forbiddenLiterals, "SoulSync persona"),
    ageRange: safeOptional(persona.ageRange, forbiddenLiterals),
    city: locationAllowed(consent) ? safeOptional(persona.city ?? profile.location.city, forbiddenLiterals) : undefined,
    mbti: safeOptional(persona.mbti, forbiddenLiterals),
    interests: safeList(persona.interests, forbiddenLiterals),
    values: safeList(flattenValues(persona.values), forbiddenLiterals),
    is_synthetic: profile.is_synthetic,
    photoSlots,
  };

  return CardGenInputSchema.parse(input);
}

const locationAllowed = (consent: PersonaConsent): boolean => consent === true || (typeof consent === "object" && consent !== null && consent.location === true);

const forbiddenProfileLiterals = (profile: Profile, consent: PersonaConsent): string[] => {
  const answerConsent = typeof consent === "object" && consent !== null ? consent.answers ?? {} : {};
  const literals = [profile.salaryBand, profile.location.district];

  for (const [key, value] of Object.entries(profile.answers)) {
    if (isSalaryKey(key) || !answerAllowed(key, consent, answerConsent) || (isSensitiveKey(key) && !sensitiveAllowed(key, consent))) {
      literals.push(...answerLiterals(value));
    }
  }

  return unique(literals.map((literal) => sanitizeProfileText(literal)).filter(isNonEmptyString));
};

const answerAllowed = (key: string, consent: PersonaConsent, answerConsent: Record<string, boolean>): boolean => {
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

const flattenValues = (values: PersonaSpec["values"]): string[] => {
  if (!values) {
    return [];
  }

  return [...values.familyValues, ...values.lifePriorities, ...values.dealbreakers];
};

const safeRequired = (value: unknown, forbiddenLiterals: string[], fallback: string): string => safeOptional(value, forbiddenLiterals) ?? fallback;

const safeOptional = (value: unknown, forbiddenLiterals: string[]): string | undefined => {
  const sanitized = sanitizeProfileText(value);

  if (sanitized.length === 0 || leaksForbidden(sanitized, forbiddenLiterals)) {
    return undefined;
  }

  return sanitized;
};

const safeList = (values: string[], forbiddenLiterals: string[]): string[] => unique(values.map((value) => safeOptional(value, forbiddenLiterals)).filter(isNonEmptyString));

const leaksForbidden = (value: string, forbiddenLiterals: string[]): boolean => forbiddenLiterals.some((literal) => literal.length > 0 && value.includes(literal));
const answerLiterals = (value: Profile["answers"][string]): string[] => (Array.isArray(value) ? value : [String(value)]);
const isSalaryKey = (key: string): boolean => /salary|income|연봉|소득|월급/i.test(key);
const isSensitiveKey = (key: string): boolean => /religion|faith|salary|income|교회|종교|신앙|기도|예배|연봉|소득|월급/i.test(key);
const unique = (values: string[]): string[] => [...new Set(values)];
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

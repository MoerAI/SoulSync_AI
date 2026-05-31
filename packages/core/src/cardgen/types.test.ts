import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  CardArtifactSchema,
  CardGenInputSchema,
  CardVersionKeySchema,
  type CardArtifact,
  type CardGenInput,
  type CardVersionKey,
} from "./types";

const validCardGenInput: CardGenInput = {
  displayName: "Mina",
  ageRange: "30s",
  city: "Seoul",
  mbti: "INTJ",
  interests: ["hiking", "coffee"],
  values: ["kindness", "curiosity"],
  is_synthetic: false,
  photoSlots: ["slot-1", "slot-2"],
};

const validCardArtifact: CardArtifact = {
  version: "card-v1",
  generatorVersion: "cardgen-v1",
  html: "<section><h1>Mina</h1></section>",
  css: ".card { color: #111; }",
  placeholders: ["slot-1", "slot-2"],
  is_synthetic: false,
};

const validCardVersionKey: CardVersionKey = {
  profileVersion: "profile-v1",
  photoFingerprint: "photo-fingerprint-v1",
  style: "minimal",
  generatorVersion: "cardgen-v1",
};

describe("cardgen contract schemas", () => {
  test("round-trips valid fixtures through each schema", () => {
    expect(CardGenInputSchema.parse(validCardGenInput)).toEqual(validCardGenInput);
    expect(CardArtifactSchema.parse(validCardArtifact)).toEqual(validCardArtifact);
    expect(CardVersionKeySchema.parse(validCardVersionKey)).toEqual(validCardVersionKey);
  });

  test("rejects unknown keys for each schema", () => {
    expect(() => CardGenInputSchema.parse({ ...validCardGenInput, exactLocation: "Gangnam" })).toThrow(z.ZodError);
    expect(() => CardArtifactSchema.parse({ ...validCardArtifact, signedPhotoUrl: "https://example.com/photo.jpg" })).toThrow(z.ZodError);
    expect(() => CardVersionKeySchema.parse({ ...validCardVersionKey, cacheKey: "derived-key" })).toThrow(z.ZodError);
  });

  test("parses photoSlots and placeholders as string arrays and rejects non-string elements", () => {
    expect(CardGenInputSchema.parse({ ...validCardGenInput, photoSlots: ["slot-3"] }).photoSlots).toEqual(["slot-3"]);
    expect(CardArtifactSchema.parse({ ...validCardArtifact, placeholders: ["slot-3"] }).placeholders).toEqual(["slot-3"]);

    expect(() => CardGenInputSchema.parse({ ...validCardGenInput, photoSlots: ["slot-1", 1] })).toThrow(z.ZodError);
    expect(() => CardArtifactSchema.parse({ ...validCardArtifact, placeholders: ["slot-1", 1] })).toThrow(z.ZodError);
  });

  test("requires is_synthetic on input and artifact schemas", () => {
    expect(() => CardGenInputSchema.parse({ displayName: "Mina", interests: [], photoSlots: [] })).toThrow(z.ZodError);
    expect(() => CardArtifactSchema.parse({
      version: "card-v1",
      generatorVersion: "cardgen-v1",
      html: "<section><h1>Mina</h1></section>",
      css: ".card { color: #111; }",
      placeholders: [],
    })).toThrow(z.ZodError);
  });

  test("defaults generator input arrays to empty arrays", () => {
    expect(CardGenInputSchema.parse({ displayName: "Mina", is_synthetic: true })).toMatchObject({
      interests: [],
      photoSlots: [],
    });
  });
});

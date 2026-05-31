import { describe, expect, test } from "vitest";

import { CardGenOutputSchema, type CardGenInput } from "./types";
import { createGguiGenerator, MockGgui } from "./generator";

const input: CardGenInput = {
  displayName: "Mina",
  ageRange: "30s",
  city: "Seoul",
  mbti: "INTJ",
  interests: ["hiking", "coffee"],
  values: ["kindness"],
  is_synthetic: false,
  photoSlots: ["slot-1", "slot-2"],
};

describe("MockGgui", () => {
  test("returns deterministic card output for identical input", async () => {
    const generator = new MockGgui();

    const first = await generator.generateCard(input);
    const second = await generator.generateCard(input);

    expect(second).toEqual(first);
  });

  test("returns output that parses through CardGenOutputSchema", async () => {
    const output = await new MockGgui().generateCard(input);

    expect(CardGenOutputSchema.parse(output)).toEqual(output);
  });

  test("renders exactly one slot image for each requested photo slot", async () => {
    const output = await new MockGgui().generateCard(input);
    const slots = [...output.html.matchAll(/<img\s+data-ggui-slot="([^"]+)"\s+alt="profile photo">/g)].map((match) => match[1]);

    expect(slots).toEqual(input.photoSlots);
  });
});

describe("createGguiGenerator", () => {
  test("returns a GGUI-like generator", async () => {
    const generator = createGguiGenerator();
    const output = await generator.generateCard(input);

    expect(CardGenOutputSchema.parse(output)).toEqual(output);
  });
});

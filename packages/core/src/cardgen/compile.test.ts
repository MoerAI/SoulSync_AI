import { describe, expect, test } from "vitest";

import { CardArtifactSchema, type CardGenOutput } from "./types";
import { compileCardArtifact } from "./compile";

const unsafeOutput: CardGenOutput = {
  html: '<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:void">x</a><iframe src=evil></iframe><img data-ggui-slot="slot-1">',
  css: ".ggui-card{color:red} body{display:none}",
};

const meta = {
  version: "card-v1",
  generatorVersion: "mock-ggui-v1",
  is_synthetic: true,
  photoSlots: ["slot-1"],
};

describe("compileCardArtifact", () => {
  test("sanitizes dangerous html while preserving slot placeholders without src", () => {
    const artifact = compileCardArtifact(unsafeOutput, meta);

    expect(artifact.html).not.toMatch(/script|iframe|onerror|javascript:|<a\b/i);
    expect(artifact.html).toContain('data-ggui-slot="slot-1"');
    expect(artifact.html).not.toMatch(/<img[^>]+src=/i);
    expect(artifact.placeholders).toEqual(["slot-1"]);
  });

  test("scopes css and returns a deterministic schema-valid artifact", () => {
    const first = compileCardArtifact(unsafeOutput, meta);
    const second = compileCardArtifact(unsafeOutput, meta);

    expect(first.css).toContain(".ggui-card");
    expect(first.css).not.toMatch(/(^|[{}\s])body\s*\{/);
    expect(second).toEqual(first);
    expect(CardArtifactSchema.parse(first)).toEqual(first);
  });
});

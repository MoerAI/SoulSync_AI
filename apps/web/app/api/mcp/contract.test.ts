import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { widgetToolCallSamples } from "../../../../../packages/widgets/src/tool-contracts";
import { dataToolInputSchemas, schemaForTool, type RegisteredDataToolName } from "./tools/registry";

const widgetSourceFiles = [
  "../../../../../packages/widgets/src/profile-form/index.tsx",
  "../../../../../packages/widgets/src/recommendations/index.tsx",
  "../../../../../packages/widgets/src/match-status/index.tsx",
  "../../../../../packages/widgets/src/profile-card/index.tsx",
] as const;

const literalCallToolPattern = /callTool\(\s*["']([^"']+)["']/g;
const dynamicCallToolPattern = /callTool\(\s*(?!["'])/;

describe("MCP widget contract", () => {
  test("every widget callTool literal is registered", async () => {
    const registered = new Set(Object.keys(dataToolInputSchemas));
    const called = new Set<string>();

    for (const relativePath of widgetSourceFiles) {
      const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
      expect(source, `${relativePath} must not hide tool names behind dynamic callTool arguments`).not.toMatch(dynamicCallToolPattern);
      for (const match of source.matchAll(literalCallToolPattern)) {
        called.add(match[1]);
      }
    }

    expect([...called].sort()).toEqual([...new Set(widgetToolCallSamples.map((sample) => sample.name))].sort());
    for (const toolName of called) {
      expect(registered.has(toolName), `${toolName} is not registered`).toBe(true);
    }
  });

  test("representative widget payloads match registered input schemas exactly", () => {
    for (const sample of widgetToolCallSamples) {
      expect(sample.name in dataToolInputSchemas, `${sample.widget} calls unregistered tool ${sample.name}`).toBe(true);
      const result = schemaForTool(sample.name as RegisteredDataToolName).safeParse(sample.args);
      expect(result.success, `${sample.widget}:${sample.name} payload must match server schema`).toBe(true);
    }
  });
});

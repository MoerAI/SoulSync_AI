import { describe, expect, test } from "vitest";

import { religionDistance } from "./religion";

describe("religionDistance", () => {
  test("keeps identical religion profiles highly compatible", () => {
    expect(religionDistance({ type: "기독교", intensity: 4 }, { type: "기독교", intensity: 4 })).toBe(1);
  });

  test("scores compatible Christian backgrounds above unrelated different religions", () => {
    const compatible = religionDistance({ type: "기독교", intensity: 3 }, { type: "천주교", intensity: 3 });
    const different = religionDistance({ type: "기독교", intensity: 3 }, { type: "불교", intensity: 3 });

    expect(compatible).toBeGreaterThan(different);
  });

  test("returns deterministic bounded scores", () => {
    const a = { type: "무교" as const, intensity: 1 };
    const b = { type: "이슬람교" as const, intensity: 5 };
    const first = religionDistance(a, b);
    const second = religionDistance(a, b);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
  });
});

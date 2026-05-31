import { defineConfig } from "vitest/config";

export default defineConfig({
  // apps/web/tsconfig.json sets `jsx: "preserve"` for Next.js, so esbuild must be
  // told to use the automatic React runtime when transforming .tsx test/component files.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    passWithNoTests: true
  }
});

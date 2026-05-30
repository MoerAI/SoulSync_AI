import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        index: "src/index.ts",
        "profile-form": "src/profile-form/index.tsx"
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      cssFileName: "profile-form"
    },
    rollupOptions: {
      external: (id) =>
        id === "react" ||
        id === "react/jsx-runtime" ||
        id === "react-dom" ||
        id === "react-dom/client" ||
        id.startsWith("node:"),
      output: {
        exports: "named"
      }
    }
  }
});

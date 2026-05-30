import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format}.js`,
      cssFileName: "index"
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

import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";

const widgetEntries = ["profile-form", "recommendations", "match-status", "profile-card"] as const;

function standaloneWidgetBuilds(): Plugin {
  return {
    name: "soulsync-standalone-widget-builds",
    async closeBundle() {
      for (const entryName of widgetEntries) {
        await build({
          configFile: false,
          define: { "process.env.NODE_ENV": JSON.stringify("production") },
          plugins: [react()],
          build: {
            cssCodeSplit: true,
            emptyOutDir: false,
            lib: {
              cssFileName: entryName,
              entry: `src/${entryName}/index.tsx`,
              fileName: () => `${entryName}.es.js`,
              formats: ["es"]
            },
            outDir: "dist",
            rollupOptions: {
              external: (id) => id.startsWith("node:"),
              output: {
                assetFileNames: `${entryName}.[ext]`,
                exports: "named",
                inlineDynamicImports: true
              }
            }
          }
        });
      }
    }
  };
}

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), standaloneWidgetBuilds()],
  build: {
    cssCodeSplit: true,
    lib: {
      cssFileName: "index",
      entry: "src/index.ts",
      fileName: (format) => `index.${format}.js`,
      formats: ["es", "cjs"]
    },
    rollupOptions: {
      external: (id) => id.startsWith("node:"),
      output: {
        exports: "named"
      }
    }
  }
});

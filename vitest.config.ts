import { defineConfig } from "vitest/config";
import path from "path";

// src/ is the module root at runtime (tsconfig baseUrl), so imports look like
// "config/index" rather than relative paths. Mirror that for tests.
export default defineConfig({
  resolve: {
    alias: {
      config: path.resolve(__dirname, "src/config"),
      auth: path.resolve(__dirname, "src/auth"),
      discord: path.resolve(__dirname, "src/discord"),
      functions: path.resolve(__dirname, "src/functions"),
      api: path.resolve(__dirname, "src/api"),
      utils: path.resolve(__dirname, "src/utils"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Redirects the JSON store to a temp dir; must run before src/ is imported.
    setupFiles: ["tests/setup.ts"],
    // The config store and tickets counter write into a data dir resolved from
    // __dirname, so tests must not run concurrently in the same process.
    fileParallelism: false,
  },
});

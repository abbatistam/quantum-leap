// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      include: ["src/core/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types/**/*",
        "src/core/wasm/wasm-loader.ts",
        "**/*.spec.ts",
        "**/node_modules/**",
        "**/dist/**",
        "**/index.ts",
        "src/core/__tests__/matrix-test-helpers.ts",
      ],
    },
  },
});

import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**", "apps/server/src/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: { statements: 80, branches: 65, functions: 75, lines: 80 },
    },
  },
});

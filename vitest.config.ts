import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/**/*.ts",
        "scripts/skills/**/*.ts",
        "integrations/pi/security.ts",
        "integrations/openclaw/plugin.mjs",
      ],
      exclude: ["src/**/*.d.ts", "src/xenova.d.ts"],
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 15,
        statements: 20,
      },
    },
  },
});

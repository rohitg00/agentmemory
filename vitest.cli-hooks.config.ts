import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 10_000,
    include: [
      "test/cli-*.test.ts",
      "test/*hook*.test.ts",
      "test/*connect*.test.ts",
      "test/context-injection.test.ts",
      "test/copilot-plugin.test.ts",
      "test/hook-project.test.ts",
      "test/pre-tool-use-project.test.ts",
      "test/worktree-project-scope.test.ts",
    ],
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/cli/ready-hint.ts",
        "src/cli/remove-plan.ts",
        "src/cli/connect/codex-hooks.ts",
        "src/cli/connect/copilot-cli.ts",
        "src/cli/connect/opencode.ts",
        "src/cli/connect/util.ts",
        "src/hooks/_http.ts",
        "src/hooks/_project.ts",
        "src/hooks/sdk-guard.ts",
      ],
      exclude: ["src/**/*.d.ts", "src/xenova.d.ts"],
      reportsDirectory: "coverage/cli-hooks",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

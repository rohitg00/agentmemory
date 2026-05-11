import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Unit coverage gate for pure modules covered by focused tests in this PR.
      // CLI entrypoints, HTTP triggers, hook executables, website code, benchmark scripts,
      // and generated plugin shims are validated by build/integration paths instead of
      // this unit gate because they depend on process, network, browser, or packaged IO.
      include: [
        "src/eval/metrics-store.ts",
        "src/functions/dedup.ts",
        "src/functions/patterns.ts",
        "src/prompts/summary.ts",
        "src/state/kv.ts",
        "src/utils/image-store.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});

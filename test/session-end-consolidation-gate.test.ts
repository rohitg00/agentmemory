import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("session-end consolidation gate", () => {
  const sourceHook = readFileSync("src/hooks/session-end.ts", "utf-8");
  const builtHook = readFileSync("plugin/scripts/session-end.mjs", "utf-8");

  it("core source hook calls consolidation only when explicitly enabled", () => {
    expect(sourceHook).toMatch(
      /process\.env\["CONSOLIDATION_ENABLED"\]\s*===\s*"true"[\s\S]*?\/agentmemory\/consolidate-pipeline/,
    );
    expect(sourceHook).toMatch(/body:\s*JSON\.stringify\(\{\s*tier:\s*"all",\s*force:\s*true\s*\}\)/);
  });

  it("built plugin hook preserves the same consolidation gate", () => {
    expect(builtHook).toMatch(
      /process\.env\["CONSOLIDATION_ENABLED"\]\s*===\s*"true"[\s\S]*?\/agentmemory\/consolidate-pipeline/,
    );
    expect(builtHook).toMatch(/force:\s*true/);
  });
});

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const scriptsDir = join(__dirname, "..", "plugin", "scripts");
const captureHooks = [
  "notification",
  "post-tool-failure",
  "post-tool-use",
  "prompt-submit",
  "session-end",
  "subagent-start",
  "subagent-stop",
  "task-completed",
];

describe("shared capture module in plugin/scripts", () => {
  it("ships the shared module under a stable name", () => {
    const shared = readFileSync(join(scriptsDir, "_capture.mjs"), "utf-8");
    expect(shared).toContain("//#region src/capture/spool.ts");
    expect(shared).toMatch(/export \{[^}]*captureObservation[^}]*\}/);
  });

  it.each(captureHooks)("%s imports the shared module instead of inlining it", (hook) => {
    const source = readFileSync(join(scriptsDir, `${hook}.mjs`), "utf-8");
    expect(source).toMatch(/from "\.\/_capture\.mjs";/);
    expect(source).not.toContain("//#region src/capture/spool.ts");
    expect(source).not.toContain("//#region src/hooks/_capture.ts");
  });

  it("leaves hooks that do not capture self-contained", () => {
    for (const hook of ["session-start", "pre-tool-use", "stop", "pre-compact", "post-commit"]) {
      expect(existsSync(join(scriptsDir, `${hook}.mjs`))).toBe(true);
      expect(readFileSync(join(scriptsDir, `${hook}.mjs`), "utf-8")).not.toContain("_capture.mjs");
    }
  });
});

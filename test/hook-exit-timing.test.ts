import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const hooksDir = join(__dirname, "..", "src", "hooks");

function numericValue(source: string, token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const match = source.match(new RegExp(`const ${token} = (\\d+);`));
  if (!match) throw new Error(`cannot resolve ${token}`);
  return Number(match[1]);
}

describe("hook exit timing", () => {
  const hooks = readdirSync(hooksDir)
    .filter((name) => name.endsWith(".ts") && !name.startsWith("_"))
    .map((name) => ({ name, source: readFileSync(join(hooksDir, name), "utf-8") }))
    .filter(({ source }) => /setTimeout\(\(\) => process\.exit\(0\), [\w]+\)\.unref\(\)/.test(source));

  it("finds the hooks that post observations", () => {
    expect(hooks.map((h) => h.name)).toEqual(
      expect.arrayContaining([
        "notification.ts",
        "post-tool-failure.ts",
        "post-tool-use.ts",
        "prompt-submit.ts",
        "subagent-start.ts",
        "subagent-stop.ts",
        "task-completed.ts",
      ]),
    );
  });

  it.each([
    "notification.ts",
    "post-tool-failure.ts",
    "post-tool-use.ts",
    "prompt-submit.ts",
    "subagent-start.ts",
    "subagent-stop.ts",
    "task-completed.ts",
  ])("%s does not exit before its observe request and spool write can finish", (name) => {
    const hook = hooks.find((h) => h.name === name)!;
    const exitCap = hook.source.match(/setTimeout\(\(\) => process\.exit\(0\), (\w+)\)\.unref\(\)/)![1];
    expect(hook.source).toMatch(/captureObservation\(/);
    expect(numericValue(hook.source, exitCap)).toBeGreaterThan(numericValue(hook.source, "OBSERVE_TIMEOUT_MS"));
  });
});

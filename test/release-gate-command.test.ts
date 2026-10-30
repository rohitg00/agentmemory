import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCommandCompleted, assertValidationRejected, runCommand } from "../scripts/release-gate/command.mjs";

describe.skipIf(process.platform === "win32")("release gate validator outcomes", () => {
  it("does not mistake a timed-out validator for a rejected configuration", async () => {
    const children = new Set<number>();
    const result = await runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { children, timeoutMs: 100 });
    expect(result.timedOut).toBe(true);
    expect(() => assertValidationRejected(result)).toThrow(/timed out/i);
    expect(children.size).toBe(0);
  });

  it("accepts an actual validator failure and retains both diagnostic streams", async () => {
    const result = await runCommand(process.execPath, ["-e", 'console.log("validation started"); console.error("invalid min_confidence"); process.exitCode = 2;']);
    expect(result).toMatchObject({ code: 2, signal: null, timedOut: false });
    expect(result.output).toContain("validation started");
    expect(result.output).toContain("invalid min_confidence");
    expect(() => assertValidationRejected(result)).not.toThrow();
  });

  it("rejects a zero-exit parent when an inherited output pipe times out", async () => {
    const children = new Set<number>();
    const result = await runCommand(process.execPath, ["-e", 'const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", process.stdout, process.stderr] }); child.unref();'], { children, timeoutMs: 1_000 });
    expect(result).toMatchObject({ code: 0, signal: null, timedOut: true });
    expect(() => assertCommandCompleted(result)).toThrow(/timed out/i);
    expect(children.size).toBe(0);
  });

  it("rejects a successful validator exit", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.exitCode = 0;"]);
    expect(() => assertValidationRejected(result)).toThrow(/nonzero validator exit code/);
  });

  it("does not count a signal termination as validation", async () => {
    const result = await runCommand(process.execPath, ["-e", 'process.kill(process.pid, "SIGTERM");']);
    expect(result).toMatchObject({ code: null, signal: "SIGTERM", timedOut: false });
    expect(() => assertValidationRejected(result)).toThrow(/terminated by SIGTERM/);
  });

  it("does not count a failed process launch as validation", async () => {
    const children = new Set<number>();
    const result = await runCommand(join(tmpdir(), `missing-agentmemory-validator-${randomUUID()}`), [], { children });
    expect(result.error).toContain("ENOENT");
    expect(() => assertValidationRejected(result)).toThrow(/ENOENT/);
    expect(children.size).toBe(0);
  });
});

describe("native gate platform preflight", () => {
  it.each(["helper", "gate"])("rejects native Windows before %s side effects", (target) => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-gate-platform-"));
    const marker = join(root, "spawned");
    const out = join(root, "out");
    const helper = new URL("../scripts/release-gate/command.mjs", import.meta.url).href;
    const gate = new URL("../scripts/release-gate/openclaw.mjs", import.meta.url).href;
    const action = target === "helper"
      ? `await runCommand(process.execPath, ["-e", ${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "spawned")`)}]);`
      : `process.argv = [process.execPath, "gate", "--package-root", ${JSON.stringify(root)}, "--engine", ${JSON.stringify(join(root, "iii"))}, "--out", ${JSON.stringify(out)}, "--openclaw-cli", ${JSON.stringify(join(root, "openclaw.mjs"))}]; await import(${JSON.stringify(gate)});`;
    try {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { runCommand } from ${JSON.stringify(helper)};
        Object.defineProperty(process, "platform", { value: "win32" });
        try { ${action} process.exitCode = 1; }
        catch (error) { console.log(error.message); }
      `], { encoding: "utf8", timeout: 10_000 });
      expect(result.error, `${result.signal}: ${result.stderr}`).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Native integration gates require macOS, Linux, or WSL2");
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});

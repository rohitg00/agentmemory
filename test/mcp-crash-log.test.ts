import { describe, it, expect, afterEach, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_CRASH_LINE_BYTES, MAX_CRASH_LOG_BYTES, formatFatal, handleFatal, mcpCrashLogPath, reportFatal, rotateCrashLog, stderrWriteMayBlock } from "../src/mcp/crash-log.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "am-mcp-crash-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runFixture(
  body: string,
  dataDir: string,
  install = "installCrashHandlers({ persist: () => {} });",
): Promise<{ code: number | null; stderr: string }> {
  const dir = tempDir();
  const fixture = join(dir, "fixture.ts");
  const moduleUrl = pathToFileURL(resolve("src/mcp/crash-log.ts")).href;
  const kvUrl = pathToFileURL(resolve("src/mcp/in-memory-kv.ts")).href;
  writeFileSync(
    fixture,
    `import { installCrashHandlers } from ${JSON.stringify(moduleUrl)};\n` +
      `import { InMemoryKV } from ${JSON.stringify(kvUrl)};\n` +
      `${install}\n${body}\n`,
  );
  return new Promise((done) => {
    execFile(
      process.execPath,
      ["--import", "tsx", fixture],
      { env: { ...process.env, AGENTMEMORY_DATA_DIR: dataDir }, timeout: 60_000 },
      (err, _stdout, stderr) => {
        done({ code: err ? ((err as { code?: number }).code ?? null) : 0, stderr });
      },
    );
  });
}

describe("MCP shim crash diagnostics", () => {
  it("writes the crash log under AGENTMEMORY_DATA_DIR", () => {
    expect(mcpCrashLogPath({ AGENTMEMORY_DATA_DIR: "/data/am" })).toBe(join("/data/am", "mcp-crash.log"));
  });

  it("redacts credentials embedded in URLs", () => {
    const line = formatFatal("uncaughtException", new Error("connect failed http://user:pw@host:3111"));
    expect(line).toContain("://***@host:3111");
    expect(line).not.toContain("user:pw");
  });

  it("logs an uncaught exception to stderr and the crash log, then exits 1", async () => {
    const dataDir = tempDir();
    const result = await runFixture(`setTimeout(() => { throw new Error("boom-sync"); }, 0);`, dataDir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("fatal");
    expect(result.stderr).toContain("boom-sync");
    const log = readFileSync(join(dataDir, "mcp-crash.log"), "utf8");
    expect(log).toContain("uncaughtException: Error: boom-sync");
  }, 90_000);

  it("logs an unhandled rejection to the crash log, then exits 1", async () => {
    const dataDir = tempDir();
    const result = await runFixture(`Promise.reject(new Error("boom-async"));`, dataDir);
    expect(result.code).toBe(1);
    const logPath = join(dataDir, "mcp-crash.log");
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, "utf8")).toContain("unhandledRejection: Error: boom-async");
  }, 90_000);

  it("saves the in-memory store before exiting on a crash", async () => {
    const dataDir = tempDir();
    const storePath = join(dataDir, "standalone.json");
    const result = await runFixture(
      `kv.set("mem:memories", "m1", { id: "m1", content: "kept across the crash" })` +
        `.then(() => setTimeout(() => { throw new Error("boom-after-save"); }, 0));`,
      dataDir,
      `const kv = new InMemoryKV(${JSON.stringify(storePath)});\n` +
        `installCrashHandlers({ persist: () => kv.persist() });`,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("boom-after-save");
    const saved = JSON.parse(readFileSync(storePath, "utf8"));
    expect(saved["mem:memories"]["m1"].content).toBe("kept across the crash");
  }, 90_000);

  it("still saves and exits when the crash reason cannot be formatted", async () => {
    const dataDir = tempDir();
    const marker = join(dataDir, "on-fatal-ran");
    const result = await runFixture(
      `const bad = new Error("unprintable");\n` +
        `Object.defineProperty(bad, "stack", { get() { throw new Error("stack getter failed"); } });\n` +
        `setTimeout(() => { throw bad; }, 0);`,
      dataDir,
      `import { writeFileSync as markDone } from "node:fs";\n` +
        `installCrashHandlers({ persist: () => markDone(${JSON.stringify(marker)}, "1") });`,
    );
    expect(result.code).toBe(1);
    expect(existsSync(marker)).toBe(true);
  }, 90_000);

  it.skipIf(process.platform === "win32")("creates the crash log readable only by its owner", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    reportFatal("uncaughtException", new Error("private detail"), logPath, () => {});
    expect(statSync(logPath).mode & 0o777).toBe(0o600);
  });

  it("says so when the crash log cannot be written", () => {
    const dataDir = tempDir();
    const blocker = join(dataDir, "not-a-dir");
    writeFileSync(blocker, "");
    const logPath = join(blocker, "mcp-crash.log");
    const lines: string[] = [];
    reportFatal("uncaughtException", new Error("boom"), logPath, (text) => lines.push(text));
    const out = lines.join("");
    expect(out).toContain(`crash log not written to ${logPath}`);
    expect(out).not.toContain(`crash log: ${logPath}`);
  });

  it("saves the store and exits when stderr never drains", () => {
    const dataDir = tempDir();
    const order: string[] = [];
    const neverDrains = (text: string) => {
      order.push(`stderr:${text.slice(0, 22)}`);
      return false;
    };
    handleFatal("uncaughtException", new Error("boom"), {
      persist: () => order.push("persist"),
      exit: (code) => order.push(`exit:${code}`),
      write: neverDrains as (text: string) => void,
      logPath: join(dataDir, "mcp-crash.log"),
      stderrMayBlock: false,
    });
    expect(order[0]).toBe("persist");
    expect(order.at(-1)).toBe("exit:1");
    expect(order.filter((step) => step.startsWith("stderr:")).length).toBeGreaterThan(0);
    expect(readFileSync(join(dataDir, "mcp-crash.log"), "utf8")).toContain("uncaughtException: Error: boom");
  });

  it("saves and exits without touching stderr when a stderr write could block", () => {
    const dataDir = tempDir();
    const order: string[] = [];
    const blockingWrite = () => {
      order.push("stderr");
      throw new Error("a blocking stderr write must not be attempted");
    };
    handleFatal("uncaughtException", new Error("boom"), {
      persist: () => order.push("persist"),
      exit: (code) => order.push(`exit:${code}`),
      write: blockingWrite,
      logPath: join(dataDir, "mcp-crash.log"),
      stderrMayBlock: true,
    });
    expect(order).toEqual(["persist", "exit:1"]);
    expect(readFileSync(join(dataDir, "mcp-crash.log"), "utf8")).toContain("uncaughtException: Error: boom");
  });

  it("keeps a fallback crash record when stderr can block and the crash log cannot be written", () => {
    const dataDir = tempDir();
    const blocker = join(dataDir, "not-a-dir");
    writeFileSync(blocker, "");
    const fallback = join(dataDir, "fallback-crash.log");
    const order: string[] = [];
    handleFatal("uncaughtException", new Error("lost without a fallback"), {
      persist: () => order.push("persist"),
      exit: (code) => order.push(`exit:${code}`),
      write: () => order.push("stderr"),
      logPath: join(blocker, "mcp-crash.log"),
      fallbackLogPath: fallback,
      stderrMayBlock: true,
    });
    expect(order).toEqual(["persist", "exit:1"]);
    const record = readFileSync(fallback, "utf8");
    expect(record).toContain("uncaughtException: Error: lost without a fallback");
    expect(record).toContain("crash log not written to");
  });

  it("bounds one oversized crash reason below the log cap", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    reportFatal("uncaughtException", new Error("x".repeat(2 * MAX_CRASH_LOG_BYTES)), logPath, () => {});
    expect(statSync(logPath).size).toBeLessThanOrEqual(MAX_CRASH_LINE_BYTES);
    expect(readFileSync(logPath, "utf8")).toContain("(truncated)");
  });

  it("rotates before an append would push the log past the cap", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    writeFileSync(logPath, "x".repeat(MAX_CRASH_LOG_BYTES - 10));
    reportFatal("uncaughtException", new Error("does not fit in the last ten bytes"), logPath, () => {});
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(statSync(logPath).size).toBeLessThan(MAX_CRASH_LOG_BYTES);
  });

  it.skipIf(process.platform === "win32")("keeps the fallback record bounded and owner-only", () => {
    const dataDir = tempDir();
    const blocker = join(dataDir, "not-a-dir");
    writeFileSync(blocker, "");
    const fallback = join(dataDir, "fallback-crash.log");
    writeFileSync(fallback, "x".repeat(MAX_CRASH_LOG_BYTES));
    chmodSync(fallback, 0o644);
    handleFatal("uncaughtException", new Error("fallback again"), {
      persist: () => {},
      exit: () => {},
      logPath: join(blocker, "mcp-crash.log"),
      fallbackLogPath: fallback,
      stderrMayBlock: true,
    });
    expect(statSync(`${fallback}.1`).mode & 0o777).toBe(0o600);
    expect(statSync(fallback).mode & 0o777).toBe(0o600);
    expect(statSync(fallback).size).toBeLessThan(MAX_CRASH_LOG_BYTES);
    expect(readFileSync(fallback, "utf8")).toContain("fallback again");
  });

  it.skipIf(process.platform === "win32")("makes an existing permissive fallback owner-only before writing", () => {
    const dataDir = tempDir();
    const blocker = join(dataDir, "not-a-dir");
    writeFileSync(blocker, "");
    const fallback = join(dataDir, "fallback-crash.log");
    writeFileSync(fallback, "older\n");
    chmodSync(fallback, 0o644);
    handleFatal("uncaughtException", new Error("private detail"), {
      persist: () => {},
      exit: () => {},
      logPath: join(blocker, "mcp-crash.log"),
      fallbackLogPath: fallback,
      stderrMayBlock: true,
    });
    expect(statSync(fallback).mode & 0o777).toBe(0o600);
  });

  it("does not fail when another process rotated the crash log first", () => {
    const dataDir = tempDir();
    const notices: string[] = [];
    expect(() => rotateCrashLog(join(dataDir, "already-rotated.log"), notices)).not.toThrow();
    expect(notices).toEqual([]);
  });

  it("treats only a Windows stderr pipe as a write that can block", () => {
    expect(stderrWriteMayBlock("win32", false)).toBe(true);
    expect(stderrWriteMayBlock("win32", true)).toBe(false);
    expect(stderrWriteMayBlock("linux", false)).toBe(false);
    expect(stderrWriteMayBlock("darwin", false)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("makes a rotated crash log owner-only", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    writeFileSync(logPath, "x".repeat(MAX_CRASH_LOG_BYTES));
    chmodSync(logPath, 0o644);
    reportFatal("uncaughtException", new Error("after rotation"), logPath, () => {});
    expect(statSync(`${logPath}.1`).mode & 0o777).toBe(0o600);
    expect(statSync(logPath).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === "win32")("restricts an existing crash log before appending", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    writeFileSync(logPath, "older entry\n", { mode: 0o644 });
    chmodSync(logPath, 0o644);
    reportFatal("uncaughtException", new Error("private detail"), logPath, () => {});
    expect(statSync(logPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(logPath, "utf8")).toContain("private detail");
  });

  it("rotates the crash log once it reaches the size cap", () => {
    const dataDir = tempDir();
    const logPath = join(dataDir, "mcp-crash.log");
    writeFileSync(logPath, "x".repeat(MAX_CRASH_LOG_BYTES));
    reportFatal("uncaughtException", new Error("after rotation"), logPath, () => {});
    expect(statSync(`${logPath}.1`).size).toBe(MAX_CRASH_LOG_BYTES);
    const current = readFileSync(logPath, "utf8");
    expect(current).toContain("after rotation");
    expect(current.length).toBeLessThan(10_000);
  });
});

describe("standalone store snapshot", () => {
  it("replaces the snapshot without leaving a temporary file", async () => {
    const dir = tempDir();
    const storePath = join(dir, "standalone.json");
    const kv = new InMemoryKV(storePath);
    await kv.set("s", "k", 1);
    expect(kv.persist()).toBe(true);
    expect(JSON.parse(readFileSync(storePath, "utf8"))).toEqual({ s: { k: 1 } });
    expect(readdirSync(dir)).toEqual(["standalone.json"]);
  });

  it.skipIf(process.platform === "win32")("keeps the snapshot readable only by its owner", async () => {
    const dir = tempDir();
    const storePath = join(dir, "standalone.json");
    const kv = new InMemoryKV(storePath);
    await kv.set("s", "k", "private");
    expect(kv.persist()).toBe(true);
    expect(statSync(storePath).mode & 0o777).toBe(0o600);
  });

  it("keeps the previous snapshot when a write fails", async () => {
    const dir = tempDir();
    const storePath = join(dir, "standalone.json");
    const kv = new InMemoryKV(storePath);
    await kv.set("s", "k", "first");
    expect(kv.persist()).toBe(true);
    mkdirSync(`${storePath}.${process.pid}.tmp`);
    await kv.set("s", "k", "second");
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(kv.persist()).toBe(false);
    } finally {
      write.mockRestore();
    }
    expect(JSON.parse(readFileSync(storePath, "utf8"))).toEqual({ s: { k: "first" } });
  });
});

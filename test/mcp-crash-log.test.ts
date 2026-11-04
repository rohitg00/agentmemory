import { describe, it, expect, afterEach, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_CRASH_LOG_BYTES, formatFatal, handleFatal, mcpCrashLogPath, reportFatal } from "../src/mcp/crash-log.js";
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
    });
    expect(order[0]).toBe("persist");
    expect(order.at(-1)).toBe("exit:1");
    expect(order.filter((step) => step.startsWith("stderr:")).length).toBeGreaterThan(0);
    expect(readFileSync(join(dataDir, "mcp-crash.log"), "utf8")).toContain("uncaughtException: Error: boom");
  });

  it("does not write to stderr synchronously on the fatal path", () => {
    const source = readFileSync(resolve("src/mcp/crash-log.ts"), "utf8");
    expect(source).not.toMatch(/writeSync\(\s*2\b/);
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

import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatFatal, mcpCrashLogPath } from "../src/mcp/crash-log.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "am-mcp-crash-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runFixture(body: string, dataDir: string): Promise<{ code: number | null; stderr: string }> {
  const dir = tempDir();
  const fixture = join(dir, "fixture.ts");
  const moduleUrl = pathToFileURL(resolve("src/mcp/crash-log.ts")).href;
  writeFileSync(
    fixture,
    `import { installCrashHandlers } from ${JSON.stringify(moduleUrl)};\n` +
      `installCrashHandlers(() => process.exit(1));\n${body}\n`,
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
});

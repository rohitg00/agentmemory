import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resetServerLogTeeForTests,
  serverLogPath,
  setupServerLogTee,
  writeServerLog,
} from "../src/cli/server-log.js";

function cliSource(): string {
  return readFileSync("src/cli.ts", "utf-8");
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  expect(start, `${name} is present`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("CLI server log persistence", () => {
  it("uses ~/.agentmemory/logs/server.log as the persistent server log", () => {
    const home = mkdtempSync(join(tmpdir(), "agentmemory-log-home-"));
    expect(serverLogPath(home)).toBe(join(home, ".agentmemory", "logs", "server.log"));
  });

  it("tees the foreground agentmemory process output before the server starts", () => {
    const source = cliSource();
    const mainStart = source.indexOf("async function main()");
    const apiFetchStart = source.indexOf("async function apiFetch");
    expect(mainStart).toBeGreaterThanOrEqual(0);
    expect(apiFetchStart).toBeGreaterThan(mainStart);
    const mainBody = source.slice(mainStart, apiFetchStart);

    const teeAt = mainBody.indexOf("setupServerLogTee()");
    const startAt = mainBody.indexOf("startEngine()");
    const importAt = mainBody.indexOf('await import("./index.js")');

    expect(teeAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(teeAt);
    expect(importAt).toBeGreaterThan(teeAt);
  });

  it("does not install the persistent log tee for standalone MCP stdio", () => {
    const source = cliSource();
    const runMcp = functionBody(source, "runMcp");
    expect(runMcp).not.toContain("setupServerLogTee");
    expect(source).toMatch(/mcp:\s*runMcp/);
  });

  it("pipes background engine stdout and stderr into the same persistent log", () => {
    const body = functionBody(cliSource(), "spawnEngineBackground");
    expect(body).toMatch(/stdio:\s*\[\s*"ignore",\s*"pipe",\s*"pipe"\s*\]/);
    expect(body).toMatch(/child\.stdout\?\.on\("data"/);
    expect(body).toMatch(/child\.stderr\?\.on\("data"/);
    expect(body).toMatch(/writeServerLog\(chunk\)/);
  });

  it("creates and repairs the server log with private permissions", () => {
    const home = mkdtempSync(join(tmpdir(), "agentmemory-log-home-"));
    const logPath = serverLogPath(home);
    const stateDir = join(home, ".agentmemory");
    const logDir = join(home, ".agentmemory", "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(logPath, "old\n");

    if (process.platform !== "win32") {
      chmodSync(stateDir, 0o777);
      chmodSync(logDir, 0o777);
      chmodSync(logPath, 0o666);
    }

    writeServerLog("new\n", logPath);

    expect(readFileSync(logPath, "utf-8")).toBe("old\nnew\n");
    if (process.platform !== "win32") {
      expect(statSync(stateDir).mode & 0o777).toBe(0o700);
      expect(statSync(logDir).mode & 0o777).toBe(0o700);
      expect(statSync(logPath).mode & 0o777).toBe(0o600);
    }
  });

  it("preserves stdout and stderr writes while teeing them to the log", () => {
    resetServerLogTeeForTests();
    const home = mkdtempSync(join(tmpdir(), "agentmemory-log-home-"));
    const logPath = serverLogPath(home);
    const stdout = new FakeWriteStream();
    const stderr = new FakeWriteStream();

    expect(
      setupServerLogTee({
        stdout,
        stderr,
        logPath,
        now: () => new Date("2026-06-14T12:00:00.000Z"),
        pid: 12345,
      }),
    ).toBe(true);

    stdout.write("out\n");
    stderr.write(Buffer.from("err\n"));

    expect(stdout.output).toBe("out\n");
    expect(stderr.output).toBe("err\n");
    expect(readFileSync(logPath, "utf-8")).toBe(
      "[agentmemory] --- server process started 2026-06-14T12:00:00.000Z pid=12345 ---\n" +
        "out\n" +
        "err\n",
    );
  });
});

class FakeWriteStream {
  output = "";

  write = ((chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: unknown) => {
    this.output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    if (typeof encodingOrCallback === "function") encodingOrCallback();
    if (typeof callback === "function") callback();
    return true;
  }) as NodeJS.WriteStream["write"];
}

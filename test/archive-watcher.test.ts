import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveWatcherTestValues,
  parseArchiveWatcherArgs,
  runArchiveWatcherCommand,
} from "../src/cli/archive-watcher.js";

const ENV_KEYS = [
  "AGENTMEMORY_URL",
  "AGENTMEMORY_ARCHIVE_ROOT",
  "AGENTMEMORY_ARCHIVE_WATCHER_STATE",
  "AGENTMEMORY_ARCHIVE_WATCHER_LOG",
  "AGENTMEMORY_ARCHIVE_POLL_SECONDS",
];
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function writeState(path: string): void {
  writeFileSync(
    path,
    JSON.stringify({ version: 2, historyPolicy: "process", seen: {}, healthRetryCount: 0 }),
  );
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

describe("archive watcher", () => {
  it("parses lifecycle commands and enforces the run mode", () => {
    expect(parseArchiveWatcherArgs(["install", "--yes"])).toMatchObject({
      action: "install",
      flags: ["--yes"],
    });
    expect(parseArchiveWatcherArgs(["run", "--mode", "once"]).mode).toBe("once");
    expect(parseArchiveWatcherArgs(["run"]).mode).toBe("background");
    expect(() => parseArchiveWatcherArgs(["run", "--mode", "invalid"])).toThrow(
      "background or once",
    );
  });

  it("uses the bounded 30s, 60s, 120s, 240s, 300s retry schedule", () => {
    expect(archiveWatcherTestValues.backoffMs(1)).toBe(30_000);
    expect(archiveWatcherTestValues.backoffMs(2)).toBe(60_000);
    expect(archiveWatcherTestValues.backoffMs(3)).toBe(120_000);
    expect(archiveWatcherTestValues.backoffMs(4)).toBe(240_000);
    expect(archiveWatcherTestValues.backoffMs(5)).toBe(300_000);
  });

  it("keeps dry-run history discovery non-mutating", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-archive-dry-run-"));
    const archiveRoot = join(root, "archives");
    const statePath = join(root, "state.json");
    mkdirSync(archiveRoot, { recursive: true });
    writeFileSync(
      join(archiveRoot, "session.jsonl"),
      `${JSON.stringify({ type: "session_meta", payload: { session_id: "dry_run" } })}\n`,
    );
    process.env.AGENTMEMORY_ARCHIVE_ROOT = archiveRoot;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_STATE = statePath;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_LOG = join(root, "watcher.log");

    await runArchiveWatcherCommand(["install", "--new-only", "--dry-run"]);
    expect(existsSync(statePath)).toBe(false);
  });

  it("waits for two stable rounds before posting and records server acknowledgement", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-archive-watcher-"));
    const archiveRoot = join(root, "archives");
    const statePath = join(root, "state.json");
    const logPath = join(root, "watcher.log");
    const archivePath = join(archiveRoot, "session.jsonl");
    writeState(statePath);
    mkdirSync(archiveRoot, { recursive: true });
    writeFileSync(
      archivePath,
      `${JSON.stringify({ type: "session_meta", payload: { session_id: "session_test" } })}\n` +
        `${JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "hello" } })}\n`,
    );

    let archivePosts = 0;
    const server = createServer((request, response) => {
      if (request.url === "/agentmemory/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "healthy" }));
        return;
      }
      if (request.url === "/agentmemory/archive/process") {
        archivePosts += 1;
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({
          success: true,
          processed: [{ sessionId: "session_test" }],
          skipped: [],
        }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    const port = await listen(server);

    process.env.AGENTMEMORY_URL = `http://127.0.0.1:${port}`;
    process.env.AGENTMEMORY_ARCHIVE_ROOT = archiveRoot;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_STATE = statePath;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_LOG = logPath;
    process.env.AGENTMEMORY_ARCHIVE_POLL_SECONDS = "1";

    await runArchiveWatcherCommand(["run", "--mode", "once", "--no-mutex"]);
    expect(archivePosts).toBe(0);
    await runArchiveWatcherCommand(["run", "--mode", "once", "--no-mutex"]);
    expect(archivePosts).toBe(1);

    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      seen: Record<string, { status: string; ledgerResult?: string; stableCount: number }>;
    };
    expect(state.seen[archivePath]).toMatchObject({
      status: "completed",
      ledgerResult: "processed",
      stableCount: 2,
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("does not send archive requests when health is offline", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-archive-health-"));
    const archiveRoot = join(root, "archives");
    const statePath = join(root, "state.json");
    writeState(statePath);
    mkdirSync(archiveRoot, { recursive: true });
    writeFileSync(
      join(archiveRoot, "session.jsonl"),
      `${JSON.stringify({ type: "session_meta", payload: { session_id: "offline_test" } })}\n`,
    );

    let archivePosts = 0;
    const server = createServer((request, response) => {
      if (request.url === "/agentmemory/health") {
        response.writeHead(503);
        response.end();
        return;
      }
      if (request.url === "/agentmemory/archive/process") archivePosts += 1;
      response.writeHead(500);
      response.end();
    });
    const port = await listen(server);
    process.env.AGENTMEMORY_URL = `http://127.0.0.1:${port}`;
    process.env.AGENTMEMORY_ARCHIVE_ROOT = archiveRoot;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_STATE = statePath;
    process.env.AGENTMEMORY_ARCHIVE_WATCHER_LOG = join(root, "watcher.log");

    await runArchiveWatcherCommand(["run", "--mode", "once", "--no-mutex"]);
    expect(archivePosts).toBe(0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("keeps the scheduled-task installer on the stable CLI surface", () => {
    const installer = readFileSync("plugin/scripts/install-archive-watcher.ps1", "utf8");
    const wrapper = readFileSync("plugin/scripts/watch-archived-sessions.ps1", "utf8");
    expect(installer).toContain("agentmemory archive-watcher run --mode background");
    expect(installer).not.toContain("watch-archived-sessions.ps1");
    expect(wrapper).toContain("agentmemory archive-watcher run");
  });
});

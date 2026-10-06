import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSpool, drainSpool, retainSent, spoolPaths, spoolPolicy, type SpoolRecord } from "../src/capture/spool.js";
import { withEventId, type ObserveBody } from "../src/hooks/_capture.js";
import { CURL_AUTH_HEADER, evaluateStatus, graphCompactCommand, type StatusInputs } from "../src/functions/status.js";
import type { CaptureStatus } from "../src/functions/capture.js";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");
const URL = "http://localhost:3111";

function body(timestamp: string, data: unknown = { prompt: "continue" }): ObserveBody {
  return { hookType: "prompt_submit", sessionId: "ses_ids", project: "p", cwd: "/w", timestamp, data };
}

function record(eventId: string, spooledAt = new Date().toISOString()): SpoolRecord {
  return { v: 1, eventId, spooledAt, reason: "unreachable", attempts: 0, body: { hookType: "post_tool_use", sessionId: "s", data: { n: eventId } } };
}

function lines(file: string): SpoolRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as SpoolRecord);
}

describe("event ids for hooks without a host id", () => {
  it("gives repeated identical prompts different ids", () => {
    const a = withEventId(body("2026-10-02T10:00:00.000Z"), { session_id: "ses_ids", prompt: "continue" });
    const b = withEventId(body("2026-10-02T10:00:05.000Z"), { session_id: "ses_ids", prompt: "continue" });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("keeps the host id stable regardless of the hook timestamp", () => {
    const host = { session_id: "ses_ids", tool_use_id: "toolu_abc12345" };
    const a = withEventId(body("2026-10-02T10:00:00.000Z"), host);
    const b = withEventId(body("2026-10-02T10:00:05.000Z"), host);
    expect(a.eventId).toBe(b.eventId);
  });

  it("keeps transcript replays stable when asked", () => {
    const content = { source: "transcript", transcript: "/t.jsonl", index: 3, prompt: "continue" };
    const a = withEventId(body("2026-10-02T10:00:00.000Z"), {}, content, { stable: true });
    const b = withEventId(body("2026-10-02T11:00:00.000Z"), {}, content, { stable: true });
    expect(a.eventId).toBe(b.eventId);
  });
});

describe("prompt-submit hook stores identical prompts twice", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("sends two distinct event ids for the same prompt text", async () => {
    const received: Array<Record<string, unknown>> = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          received.push(JSON.parse(raw));
        } catch {}
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const home = mkdtempSync(join(tmpdir(), "am-prompt-twice-"));
    const env = {
      PATH: process.env["PATH"] ?? "",
      HOME: home,
      AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
      AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool"),
    };
    const payload = JSON.stringify({ session_id: "ses_twice", cwd: "/work/p", hook_event_name: "UserPromptSubmit", prompt: "continue" });
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [join(HOOKS_DIR, "prompt-submit.mjs")], { env, stdio: ["pipe", "ignore", "ignore"] });
        child.on("error", reject);
        child.on("close", () => resolve());
        child.stdin.end(payload);
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    const prompts = received.filter((r) => r["hookType"] === "prompt_submit");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]!["eventId"]).not.toBe(prompts[1]!["eventId"]);
  });
});

describe("spool operations without the lock", () => {
  it("does not evict kept records when the append could not take the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-spool-unlocked-"));
    const policy = { ...spoolPolicy({}), maxBytes: 64 * 1024, maxRecordBytes: 16 * 1024 };
    const paths = spoolPaths(URL, dir);
    expect(retainSent(URL, "ev_kept_1", { data: { big: "x".repeat(15_000) } }, { bootId: "bootAAAA1111", durableAfterMs: 60_000 }, { policy, dir })).toBe(true);
    for (let i = 0; i < 3; i++) appendSpool(URL, `ev_fill_${i}`, { data: { big: "y".repeat(15_000) } }, "unreachable", { policy, dir });
    const keptBefore = readdirSync(dir).filter((f) => f.includes(".sent-"));
    expect(keptBefore).toHaveLength(1);
    writeFileSync(paths.lock, "999999\n");
    const result = appendSpool(URL, "ev_overflow", { data: { big: "z".repeat(15_000) } }, "unreachable", { policy, dir });
    expect(result.spooled).toBe(false);
    expect(readdirSync(dir).filter((f) => f.includes(".sent-"))).toEqual(keptBefore);
  });

  it("leaves the main spool file alone and requeues to a separate file when the lock is held", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-spool-requeue-"));
    const paths = spoolPaths(URL, dir);
    writeFileSync(paths.file, JSON.stringify(record("ev_main")) + "\n");
    const orphan = join(dir, `${paths.name}.draining-1-1.jsonl`);
    writeFileSync(orphan, JSON.stringify(record("ev_orphan")) + "\n");
    utimesSync(orphan, 0, 0);
    writeFileSync(paths.lock, "999999\n");
    const result = await drainSpool(URL, async () => "retry", { dir });
    expect(result.claimed).toBe(1);
    expect(lines(paths.file).map((r) => r.eventId)).toEqual(["ev_main"]);
    expect(existsSync(orphan)).toBe(false);
    const requeued = readdirSync(dir).filter((f) => f.endsWith("-requeue.jsonl"));
    expect(requeued).toHaveLength(1);
    const file = join(dir, requeued[0]!);
    expect(lines(file).map((r) => r.eventId)).toEqual(["ev_orphan"]);
    expect(statSync(file).mtimeMs).toBe(0);
  });
});

function statusInputs(capture: CaptureStatus | null | undefined): StatusInputs {
  return {
    now: new Date("2026-10-02T12:00:00.000Z"),
    version: "0.9.30",
    engineVersion: "0.22.1",
    uptimeSeconds: 60,
    stateBackend: "file",
    ports: { rest: 3111, streams: 3112, viewer: 3113 },
    health: { status: "healthy", alerts: [], notes: [], connectionState: "connected" },
    circuitBreaker: { state: "closed", failures: 0 },
    functionMetrics: [],
    provider: "llm",
    embeddingProvider: "embeddings",
    flags: [],
    index: { bm25Documents: 1, vectorDocuments: 1, observationsIndexed: 1, missingObservations: 0, sessions: 1, bm25Incomplete: false, pendingVectorBackfill: 0 },
    graph: null,
    graphExtractionEnabled: false,
    auditLegacy: null,
    capture,
  };
}

function spoolSummaryWith(dropped: number, lastDropAt: string, reason: string) {
  return {
    enabled: true,
    path: "/tmp/x.jsonl",
    records: 0,
    bytes: 0,
    oldestAt: null,
    retained: 0,
    retainedBytes: 0,
    maxBytes: 5 * 1024 * 1024,
    maxAgeHours: 168,
    stats: { spooled: 0, dropped, droppedBytes: 0, expired: 0, delivered: 0, duplicates: 0, rejected: 0, lastDropAt, lastDropReason: reason },
  };
}

function capture(spool: ReturnType<typeof spoolSummaryWith>[], dead = 0): CaptureStatus {
  return {
    policy: { maxAttempts: 5, retryIntervalMs: 10_000, dedupRetentionHours: 168 },
    inbox: { pending: 0, retrying: 0, dead, oldestAcceptedAt: null, nextAttemptAt: null, lastError: null },
    sinceStart: { accepted: 0, completed: 0, duplicates: 0, retried: 0, recovered: 0, deadLettered: 0, rejected: 0, pruned: 0 },
    lastSweepAt: null,
    lastPruneAt: null,
    lastBootDrain: null,
    spool,
  } as unknown as CaptureStatus;
}

describe("capture status", () => {
  it("says capture was not checked when the capture status is unavailable", () => {
    const report = evaluateStatus(statusInputs(null));
    const p = report.problems.find((x) => x.code === "capture-check-unavailable");
    expect(p?.level).toBe("info");
    expect(report.status).not.toBe("ok");
  });

  it("adds nothing when capture status is simply not provided", () => {
    expect(evaluateStatus(statusInputs(undefined)).problems.map((p) => p.code)).not.toContain("capture-check-unavailable");
  });

  it("sums drops across spools and reports the most recent reason", () => {
    const report = evaluateStatus(
      statusInputs(capture([spoolSummaryWith(2, "2026-10-02T11:00:00.000Z", "full"), spoolSummaryWith(3, "2026-10-02T11:30:00.000Z", "too-large")])),
    );
    const drops = report.problems.filter((p) => p.code === "capture-spool-dropped");
    expect(drops).toHaveLength(1);
    expect(drops[0]!.message).toContain("5 observations");
    expect(drops[0]!.message).toContain("too-large");
  });

  it("prints recovery commands that send the secret", () => {
    const report = evaluateStatus(statusInputs(capture([], 2)));
    const dead = report.problems.find((p) => p.code === "capture-dead-letters");
    expect(dead?.fix?.split(CURL_AUTH_HEADER).length).toBe(3);
    expect(graphCompactCommand(3111)).toContain(CURL_AUTH_HEADER);
    expect(CURL_AUTH_HEADER).toContain("Authorization: Bearer");
  });
});

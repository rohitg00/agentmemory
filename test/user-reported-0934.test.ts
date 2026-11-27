import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { appendSpool, drainSpool, retainSentOutcome, sendOutcome, spoolDir, spoolPolicy, spoolReadDirs, spoolSummary } from "../src/capture/spool.js";
import { runCaptureCommand } from "../src/cli/capture.js";
import { resolveDataDir } from "../src/cli-data-dir.js";
import { BOOT_TOLERANCE_MS, writtenBeforeBoot } from "../src/cli/compose-process.js";
import { renderWorkerCompose } from "../src/cli/compose-project.js";
import { detectLlmProviderKind, llmOptInHint } from "../src/config.js";
import { MetricsStore, RECENT_WINDOW } from "../src/eval/metrics-store.js";
import { isRestatement, matchSemanticFact } from "../src/functions/consolidation-pipeline.js";
import type { SemanticMemory } from "../src/types.js";
import { KV } from "../src/state/schema.js";
import { mockKV } from "./helpers/mocks.js";

const URL = "http://localhost:4977";

function record(id: string) {
  return { hookType: "post_tool_use", sessionId: "ses_1", project: "p", cwd: "/w", timestamp: new Date().toISOString(), data: { id } };
}

describe("capture send classification", () => {
  it("drops only agentmemory's own permanent rejection", () => {
    expect(sendOutcome(201, { status: "accepted" })).toBe("delivered");
    expect(sendOutcome(200, "")).toBe("duplicate");
    expect(sendOutcome(202, { status: "duplicate" })).toBe("duplicate");
    expect(sendOutcome(422, { status: "rejected", error: "invalid" })).toBe("rejected");
    expect(sendOutcome(400, JSON.stringify({ status: "rejected" }))).toBe("rejected");
    expect(sendOutcome(413, "")).toBe("rejected");
    expect(sendOutcome(422, { status: "rejected", retryable: true })).toBe("retry");
    expect(sendOutcome(400, "<html>bad gateway</html>")).toBe("retry");
    for (const status of [0, 401, 403, 404, 408, 429, 500, 503]) expect(sendOutcome(status, "<no route>")).toBe("retry");
  });

  it("keeps spooled records when the drain gets 404 from an unregistered route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-404-drain-"));
    for (const id of ["evt-00000001", "evt-00000002", "evt-00000003"]) appendSpool(URL, id, record(id), "unreachable", { dir });
    const result = await drainSpool(URL, async () => sendOutcome(404, "<no route>"), { dir });
    expect(result.rejected).toBe(0);
    expect(spoolSummary(URL, { dir }).records).toBe(3);
  });
});

describe("capture drain durability copy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a delivered record queued when its durability copy cannot be written", async () => {
    const earlier = mkdtempSync(join(tmpdir(), "am-earlier-"));
    appendSpool(URL, "evt-00000001", record("evt-00000001"), "unreachable", { dir: earlier });
    const blocked = join(mkdtempSync(join(tmpdir(), "am-blocked-")), "file");
    writeFileSync(blocked, "");
    vi.stubGlobal("fetch", async (input: string) =>
      new Response(JSON.stringify(input.endsWith("/observe") ? { status: "accepted", bootId: "boot00000001", durableAfterMs: 1000 } : {}), {
        status: input.endsWith("/observe") ? 201 : 200,
      }),
    );
    const run = (dir: string) => runCaptureCommand({ base: URL, args: ["--drain", "--json"], dirs: [dir, earlier], log: () => {} });

    await run(join(blocked, "spool"));
    expect(spoolSummary(URL, { dir: earlier }).records).toBe(1);

    await run(mkdtempSync(join(tmpdir(), "am-current-")));
    expect(spoolSummary(URL, { dir: earlier }).records).toBe(0);
  });

  it("tells a copy that can never be written from one that failed this time", () => {
    const mark = { bootId: "boot00000001", durableAfterMs: 1000 };
    const dir = mkdtempSync(join(tmpdir(), "am-retain-"));
    expect(retainSentOutcome(URL, "evt-00000001", record("evt-00000001"), mark, { dir })).toBe("retained");
    const tiny = { ...spoolPolicy(), maxRecordBytes: 16 };
    expect(retainSentOutcome(URL, "evt-00000002", record("evt-00000002"), mark, { dir, policy: tiny })).toBe("skipped");
    const off = { ...spoolPolicy(), enabled: false };
    expect(retainSentOutcome(URL, "evt-00000003", record("evt-00000003"), mark, { dir, policy: off })).toBe("skipped");
    const blocked = join(mkdtempSync(join(tmpdir(), "am-blocked-")), "file");
    writeFileSync(blocked, "");
    expect(retainSentOutcome(URL, "evt-00000004", record("evt-00000004"), mark, { dir: join(blocked, "spool") })).toBe("failed");
  });

  it("does not hold the queue for a record whose copy can never be written", async () => {
    const earlier = mkdtempSync(join(tmpdir(), "am-earlier-"));
    for (const id of ["evt-00000001", "evt-00000002"]) appendSpool(URL, id, record(id), "unreachable", { dir: earlier });
    vi.stubGlobal("fetch", async (input: string) =>
      new Response(JSON.stringify(input.endsWith("/observe") ? { status: "accepted", bootId: "not valid", durableAfterMs: 1000 } : {}), {
        status: input.endsWith("/observe") ? 201 : 200,
      }),
    );
    await runCaptureCommand({ base: URL, args: ["--drain", "--json"], dirs: [mkdtempSync(join(tmpdir(), "am-current-")), earlier], log: () => {} });
    expect(spoolSummary(URL, { dir: earlier }).records).toBe(0);
  });
});

describe("capture spool folder", () => {
  it("does not adopt a legacy data folder in the hook's working directory", () => {
    const project = mkdtempSync(join(tmpdir(), "am-project-"));
    mkdirSync(join(project, "data"));
    writeFileSync(join(project, "data", "state_store.db"), "");
    const home = mkdtempSync(join(tmpdir(), "am-home-"));
    const env = { HOME: home, XDG_DATA_HOME: join(home, "xdg") };
    expect(resolveDataDir({ args: [], env, cwd: project, home, platform: "linux" }).dataDir).toBe(join(project, "data"));
    const cwd = process.cwd();
    process.chdir(project);
    try {
      expect(spoolDir(env)).not.toContain(join(project, "data"));
    } finally {
      process.chdir(cwd);
    }
  });

  it("still reads the spool an earlier version left in the legacy data folder", () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), "am-project-")));
    mkdirSync(join(project, "data"));
    writeFileSync(join(project, "data", "state_store.db"), "");
    const home = mkdtempSync(join(tmpdir(), "am-home-"));
    const env = { HOME: home, XDG_DATA_HOME: join(home, "xdg") };
    const cwd = process.cwd();
    process.chdir(project);
    try {
      expect(spoolReadDirs(env)).toEqual([spoolDir(env)]);
      mkdirSync(join(project, "data", "capture-spool"));
      expect(spoolReadDirs(env)).toEqual([spoolDir(env), join(project, "data", "capture-spool")]);
      const explicit = { ...env, AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool") };
      expect(spoolReadDirs(explicit)).toEqual([join(home, "spool")]);
      const dataDir = { ...env, AGENTMEMORY_DATA_DIR: join(home, "store") };
      expect(spoolReadDirs(dataDir)).toEqual([join(home, "store", "capture-spool")]);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("LLM keys claimed by the embedding provider", () => {
  const base = { AGENTMEMORY_ALLOW_AGENT_SDK: "true", EMBEDDING_PROVIDER: "openai" };

  it("claims OPENAI_API_KEY only when embeddings read it", () => {
    expect(detectLlmProviderKind({ ...base, OPENAI_API_KEY: "sk-real-key-value" })).toBe("llm");
    const split = { ...base, OPENAI_API_KEY: "sk-real-key-value", OPENAI_EMBEDDING_API_KEY: "sk-embedding-key" };
    expect(detectLlmProviderKind(split)).toBe("noop");
    expect(llmOptInHint(split)).toContain("Found OPENAI_API_KEY and AGENTMEMORY_ALLOW_AGENT_SDK=true");
  });

  it("treats a placeholder embedding key for a local endpoint as the key embeddings read", () => {
    const local = { ...base, OPENAI_API_KEY: "sk-real-key-value", OPENAI_EMBEDDING_API_KEY: "local" };
    expect(detectLlmProviderKind(local)).toBe("noop");
    expect(llmOptInHint(local)).toContain("Found OPENAI_API_KEY and");
  });

  it("judges Gemini by the key the chat provider would use", () => {
    const env = { AGENTMEMORY_ALLOW_AGENT_SDK: "true", EMBEDDING_PROVIDER: "gemini" };
    expect(detectLlmProviderKind({ ...env, GEMINI_API_KEY: "real-key-value" })).toBe("llm");
    expect(detectLlmProviderKind({ ...env, GEMINI_API_KEY: "real-key-value", GOOGLE_API_KEY: "other-key-value" })).toBe("llm");
    expect(llmOptInHint({ ...env, GOOGLE_API_KEY: "other-key-value" })).toContain("Found GOOGLE_API_KEY and");
  });
});

describe("semantic fact matching", () => {
  const stored = (fact: string): SemanticMemory[] => [{ id: "sem_1", fact } as SemanticMemory];

  it("matches a restatement that only adds filler words", () => {
    const fact = "Redis was chosen over Memcached for session storage because Redis persists to disk with RDB snapshots";
    expect(matchSemanticFact(stored(fact), `Decision recorded: ${fact}`)?.id).toBe("sem_1");
    expect(matchSemanticFact(stored(fact), fact.toUpperCase())?.id).toBe("sem_1");
  });

  it("keeps a fact that changes a number, a word or the polarity", () => {
    expect(matchSemanticFact(stored("The production API listens on port 80"), "The production API listens on port 81")).toBeUndefined();
    expect(
      matchSemanticFact(
        stored("Payments are enabled for all European customers in production this quarter"),
        "Payments are disabled for all European customers in production this quarter",
      ),
    ).toBeUndefined();
    expect(
      matchSemanticFact(
        stored("The nightly backup job runs on the primary database cluster in the Frankfurt region"),
        "The nightly backup job never runs on the primary database cluster in the Frankfurt region",
      ),
    ).toBeUndefined();
    expect(isRestatement("the cache beats the queue on latency", "the queue beats the cache on latency")).toBe(false);
    expect(isRestatement("deploys are frozen", "deploys aren't frozen")).toBe(false);
  });

  it("follows an explicit ref whatever the wording", () => {
    expect(matchSemanticFact(stored("Sessions live in Redis"), "Redis holds the sessions", "sem_1")?.id).toBe("sem_1");
  });
});

describe("Worker Compose environment", () => {
  const base = {
    ports: { restPort: 3511, viewerPort: 3513, enginePort: 49534 },
    dataDir: "/srv/am/data",
    projectRoot: "/srv/am/pkg",
    nodeBin: "/opt/node/bin/node",
    homeDir: "/home/u",
    startupTimeoutMs: 300_000,
    linux: true,
  };

  it("passes the data root the hooks resolve their default spool from", () => {
    const linux = parse(renderWorkerCompose({ ...base, workerEnvironment: { XDG_DATA_HOME: "/home/u/.data" } }));
    expect(linux.containers.agentmemory.environment.XDG_DATA_HOME).toBe("/home/u/.data");
    const windows = parse(renderWorkerCompose({ ...base, windows: true, nodeBin: "C:\\node\\node.exe", workerEnvironment: { APPDATA: "C:\\Users\\u\\AppData\\Roaming", PATH: "C:\\node" } }));
    expect(windows.containers.agentmemory.environment.APPDATA).toBe("C:\\Users\\u\\AppData\\Roaming");
    const unset = parse(renderWorkerCompose({ ...base, workerEnvironment: {} }));
    expect(unset.containers.agentmemory.environment.XDG_DATA_HOME).toBeUndefined();
  });
});

describe("Compose state from an earlier boot", () => {
  it("treats state written before the current boot as stale", () => {
    const now = Date.parse("2026-11-18T10:00:00Z");
    const uptimeSeconds = 3600;
    const bootAt = now - uptimeSeconds * 1000;
    expect(writtenBeforeBoot(bootAt - BOOT_TOLERANCE_MS - 1, now, uptimeSeconds)).toBe(true);
    expect(writtenBeforeBoot(bootAt + 1000, now, uptimeSeconds)).toBe(false);
    expect(writtenBeforeBoot(bootAt - 1000, now, uptimeSeconds)).toBe(false);
    expect(writtenBeforeBoot(Number.NaN, now, uptimeSeconds)).toBe(false);
    expect(writtenBeforeBoot(0, now, 0)).toBe(false);
  });
});

describe("function metrics", () => {
  it("keeps a bounded recent window and resets on request", async () => {
    const kv = mockKV();
    const store = new MetricsStore(kv as never);
    for (let i = 0; i < 30; i++) await store.record("mem::summarize", 10, i >= 25);
    const metrics = await store.get("mem::summarize");
    expect(metrics?.totalCalls).toBe(30);
    expect(metrics?.recent).toHaveLength(RECENT_WINDOW);
    expect(metrics?.recent?.endsWith("0000011111")).toBe(true);
    await store.record("mem::compress", 10, true);
    expect(await store.reset("mem::summarize")).toEqual({ reset: ["mem::summarize"], failed: [] });
    expect(await kv.get(KV.metrics, "mem::summarize")).toBeNull();
    expect(await store.get("mem::summarize")).toBeNull();
    expect(await store.reset()).toEqual({ reset: ["mem::compress"], failed: [] });
    expect(await store.getAll()).toEqual([]);
  });

  it("does not let a call that was already recording bring back counts after a reset", async () => {
    const kv = mockKV();
    await kv.set(KV.metrics, "mem::summarize", { functionId: "mem::summarize", totalCalls: 50, successCount: 0, failureCount: 50, avgLatencyMs: 10, avgQualityScore: 0 });
    const store = new MetricsStore(kv as never);
    await Promise.all([store.record("mem::summarize", 10, false), store.reset("mem::summarize")]);
    expect(await kv.get(KV.metrics, "mem::summarize")).toBeNull();
    expect(await store.get("mem::summarize")).toBeNull();
  });

  it("fails a full reset when the stored metrics cannot be listed", async () => {
    const kv = mockKV();
    const store = new MetricsStore(kv as never);
    await store.record("mem::summarize", 10, false);
    kv.list = async () => {
      throw new Error("state unavailable");
    };
    await expect(store.reset()).rejects.toThrow("state unavailable");
    expect((await store.getAll()).map((m) => m.functionId)).toEqual(["mem::summarize"]);
  });

  it("names the metrics a reset could not delete and keeps them", async () => {
    const kv = mockKV();
    const store = new MetricsStore(kv as never);
    await store.record("mem::summarize", 10, false);
    await store.record("mem::compress", 10, true);
    const remove = kv.delete;
    kv.delete = (async (scope: string, key: string) => {
      if (key === "mem::compress") throw new Error("disk busy");
      return remove(scope, key);
    }) as typeof kv.delete;
    const outcome = await store.reset();
    expect(outcome.reset).toEqual(["mem::summarize"]);
    expect(outcome.failed).toEqual(["mem::compress"]);
    expect((await store.getAll()).map((m) => m.functionId)).toEqual(["mem::compress"]);
  });
});

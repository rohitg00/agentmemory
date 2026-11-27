import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { appendSpool, drainSpool, sendOutcome, spoolDir, spoolReadDirs, spoolSummary } from "../src/capture/spool.js";
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

  it("counts a Gemini LLM key the embedding provider does not read", () => {
    const env = { AGENTMEMORY_ALLOW_AGENT_SDK: "true", EMBEDDING_PROVIDER: "gemini" };
    expect(detectLlmProviderKind({ ...env, GEMINI_API_KEY: "real-key-value" })).toBe("llm");
    expect(llmOptInHint({ ...env, GEMINI_API_KEY: "real-key-value", GOOGLE_API_KEY: "other-key-value" })).toContain("Found GOOGLE_API_KEY and");
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
    expect(await store.reset("mem::summarize")).toEqual(["mem::summarize"]);
    expect(await kv.get(KV.metrics, "mem::summarize")).toBeNull();
    expect(await store.get("mem::summarize")).toBeNull();
    expect((await store.reset()).sort()).toEqual(["mem::compress"]);
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
});

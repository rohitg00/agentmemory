import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { appendSpool, drainSpool, sendOutcome, spoolDir, spoolSummary } from "../src/capture/spool.js";
import { resolveDataDir } from "../src/cli-data-dir.js";
import { BOOT_TOLERANCE_MS, writtenBeforeBoot } from "../src/cli/compose-process.js";
import { renderWorkerCompose } from "../src/cli/compose-project.js";
import { MetricsStore, RECENT_WINDOW } from "../src/eval/metrics-store.js";
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
});

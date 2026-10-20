import { describe, expect, it } from "vitest";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { resetGraphGeneration } from "../src/state/graph-generation.js";
import {
  GRAPH_INDEX_MANIFEST_MAX_BYTES, GRAPH_INDEX_MANIFEST_MAX_IDS, GRAPH_INDEX_MIGRATION_KEY,
  GraphIndexMigrationController, getGraphIndexMigrationStatus, graphIndexManifestKey,
  type GraphIndexManifestPage, type GraphIndexMigration,
} from "../src/state/graph-index-migration.js";
import { createGraphIndexReader, getGraphIndexStatus } from "../src/state/graph-retrieval-index.js";
import type { GraphNode } from "../src/types.js";

const now = "2026-10-14T00:00:00.000Z";
const node = (id: string): GraphNode => ({ id, name: id, type: "concept", properties: {}, sourceObservationIds: ["observation"], createdAt: now });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function setup() {
  const rows = new Map<string, Map<string, unknown>>();
  const calls: Array<{ fn: string; scope: string; key?: string; value?: unknown }> = [];
  let intercept: ((fn: string, payload: any) => Promise<void> | void) | undefined;
  const sdk = { trigger: async ({ function_id: fn, payload }: any) => {
    calls.push({ fn, ...structuredClone(payload) });
    await intercept?.(fn, payload);
    const scope = rows.get(payload.scope) ?? new Map<string, unknown>();
    if (fn === "state::get") return structuredClone(scope.get(payload.key) ?? null);
    if (fn === "state::list") return structuredClone([...scope.values()]);
    if (fn === "state::set") { scope.set(payload.key, structuredClone(payload.value)); rows.set(payload.scope, scope); return payload.value; }
    if (fn === "state::delete") { scope.delete(payload.key); return; }
    throw new Error(`Unexpected ${fn}`);
  } };
  const kv = new StateKV(sdk as never);
  return { kv, rows, calls, sdk, controller: new GraphIndexMigrationController(kv), intercept: (f?: typeof intercept) => { intercept = f; } };
}

describe("explicit graph index migration", () => {
  it("keeps legacy status and boot read-only without a snapshot or graph listing", async () => {
    const { kv, controller, calls, rows } = setup();
    rows.set(KV.graphNodes, new Map([["old", node("old")]]));
    expect(await controller.status()).toMatchObject({ state: "needs-migration", ready: false, coverage: "unknown" });
    await controller.resumeOnBoot();
    expect(calls.some((call) => call.fn === "state::list" || call.fn === "state::set" || call.scope === KV.graphSnapshot)).toBe(false);
    await expect(controller.start()).rejects.toThrow("allowLegacyScan");
    expect(calls.some((call) => call.fn === "state::list" || call.fn === "state::set")).toBe(false);
    expect(await getGraphIndexMigrationStatus(kv)).toHaveProperty("ready", false);
  });

  it("writes intent before discovery, returns promptly and joins duplicate requests", async () => {
    const { controller, rows, calls, intercept } = setup();
    rows.set(KV.graphNodes, new Map([["old", node("old")]]));
    const entered = deferred(); const release = deferred();
    intercept(async (fn, payload) => {
      if (fn === "state::list" && payload.scope === KV.graphNodes) { entered.resolve(); await release.promise; }
    });
    const first = await controller.start({ allowLegacyScan: true });
    await entered.promise;
    expect(first).toMatchObject({ state: "discovering", sealed: false });
    expect((await controller.start({ allowLegacyScan: true })).jobId).toBe(first.jobId);
    expect((await controller.start({ resume: true })).jobId).toBe(first.jobId);
    const intent = calls.findIndex((call) => call.fn === "state::set" && call.scope === KV.graphIndexMigration);
    const scan = calls.findIndex((call) => call.fn === "state::list" && call.scope === KV.graphNodes);
    expect(intent).toBeGreaterThanOrEqual(0); expect(intent).toBeLessThan(scan);
    release.resolve(); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ ready: true, processed: 1, total: 1, coverage: "complete" });
    expect(calls.filter((call) => call.fn === "state::list").map((call) => call.scope)).toEqual([KV.graphNodes, KV.graphEdges, KV.graphEdgeHistory]);
  });

  it("indexes empty scopes and history without changing the canonical generation or rows", async () => {
    const { controller, kv, rows } = setup();
    rows.set(KV.graphEdgeHistory, new Map([["past", { id: "past", sourceNodeId: "missing-a", targetNodeId: "missing-b", type: "uses", weight: 1, sourceObservationIds: [], createdAt: now, isLatest: false }]]));
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ ready: true, total: 1, historyEdges: 1, nodes: 0, edges: 0 });
    expect(await kv.get(KV.graphControl, "generation")).toBeNull();
    expect(rows.get(KV.graphEdgeHistory)?.size).toBe(1);
  });

  it.each(["discovering", "building"] as const)("keeps %s status during a normal per-record pending write", async (state) => {
    const { controller, rows, calls } = setup();
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const control = rows.get(KV.graphRetrievalControl)!.get("current") as object;
    const job = rows.get(KV.graphIndexMigration)!.get(GRAPH_INDEX_MIGRATION_KEY) as GraphIndexMigration;
    rows.get(KV.graphRetrievalControl)!.set("current", { ...control, status: "building", pending: { kind: "node", id: "a" } });
    rows.get(KV.graphIndexMigration)!.set(GRAPH_INDEX_MIGRATION_KEY, { ...job, state, sealed: state === "building" });
    calls.length = 0;
    const status = await controller.status();
    expect(status).toMatchObject({ state, ready: false, coverage: "unknown" });
    expect(status.action).toContain("in progress");
    if (state === "building") expect(status.action).not.toContain("resume");
    else expect(status.action).toContain("If it was interrupted");
    expect(calls.every((call) => call.fn === "state::get")).toBe(true);
  });

  it("leaves interrupted unsealed discovery read-only at boot with an explicit consent hint", async () => {
    const { controller, rows, calls, sdk } = setup();
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const control = rows.get(KV.graphRetrievalControl)!.get("current") as object;
    const job = rows.get(KV.graphIndexMigration)!.get(GRAPH_INDEX_MIGRATION_KEY) as GraphIndexMigration;
    rows.get(KV.graphRetrievalControl)!.set("current", { ...control, status: "building" });
    rows.get(KV.graphIndexMigration)!.set(GRAPH_INDEX_MIGRATION_KEY, { ...job, state: "discovering", sealed: false });
    calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.resumeOnBoot();
    const status = await restarted.status();
    expect(status).toMatchObject({ state: "discovering", ready: false, sealed: false });
    expect(status.action).toContain("resume --allow-legacy-scan during maintenance");
    expect(calls.every((call) => call.fn === "state::get")).toBe(true);
    await expect(restarted.start({ resume: true })).rejects.toThrow("authorize another complete legacy scan");
  });

  it.each(["control-paused", "batch-pending", "job-error"])("keeps %s fail-closed even when a matching job says building", async (failure) => {
    const { controller, rows } = setup();
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const control = rows.get(KV.graphRetrievalControl)!.get("current") as object;
    const job = rows.get(KV.graphIndexMigration)!.get(GRAPH_INDEX_MIGRATION_KEY) as GraphIndexMigration;
    rows.get(KV.graphRetrievalControl)!.set("current", {
      ...control, status: failure === "control-paused" ? "paused" : "building", pending: { kind: "node", id: "a" },
      ...(failure === "batch-pending" ? { batchPending: true } : {}),
    });
    rows.get(KV.graphIndexMigration)!.set(GRAPH_INDEX_MIGRATION_KEY, { ...job, state: "building", ...(failure === "job-error" ? { error: "Storage unavailable" } : {}) });
    expect(await controller.status()).toMatchObject({ state: "paused", ready: false, coverage: "unknown" });
    expect((await controller.status()).action).not.toContain("in progress");
  });

  it("reports and resumes a failed final migration checkpoint after index publication", async () => {
    const { controller, intercept } = setup();
    intercept((fn, payload) => {
      if (fn === "state::set" && payload.scope === KV.graphIndexMigration && payload.value.state === "ready") throw new Error("final checkpoint unavailable");
    });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ state: "paused", ready: false, error: expect.any(String) });
    intercept();
    await controller.start({ resume: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ state: "ready", ready: true, coverage: "complete" });
    expect((await controller.status()).error).toBeUndefined();
  });

  it("bounds manifests by entry count and UTF-8 bytes", async () => {
    const { controller, rows } = setup();
    const ids = Array.from({ length: 300 }, (_, i) => `${i}:` + "界".repeat(300));
    rows.set(KV.graphNodes, new Map(ids.map((id) => [id, node(id)])));
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const pages = [...(rows.get(KV.graphIndexManifest)?.values() ?? [])] as GraphIndexManifestPage[];
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      expect(page.ids.length).toBeLessThanOrEqual(GRAPH_INDEX_MANIFEST_MAX_IDS);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(GRAPH_INDEX_MANIFEST_MAX_BYTES);
    }
    expect(await controller.status()).toMatchObject({ ready: true, processed: 300 });
  });

  it("requires renewed consent after an interrupted discovery and never scans at boot", async () => {
    const { controller, kv, calls, rows, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["old", node("old")]]));
    intercept((fn, payload) => { if (fn === "state::list" && payload.scope === KV.graphEdges) throw new Error("offline"); });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ state: "paused", sealed: false });
    intercept(); calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.resumeOnBoot();
    await expect(restarted.start({ resume: true })).rejects.toThrow("authorize another complete legacy scan");
    expect(calls.some((call) => call.fn === "state::list")).toBe(false);
    await restarted.start({ resume: true, allowLegacyScan: true }); await restarted.waitForIdle();
    expect(await restarted.status()).toHaveProperty("ready", true);
    expect(await kv.get(KV.graphControl, "generation")).toBeNull();
  });

  it("resumes a sealed manifest after restart without a full scan and rereads current rows", async () => {
    const { controller, rows, calls, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")], ["b", node("b")]]));
    let pause = true;
    intercept((fn, payload) => { if (pause && fn === "state::get" && payload.scope === KV.graphNodes && payload.key === "b") throw new Error("crash"); });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ state: "paused", sealed: true, processed: 1 });
    rows.get(KV.graphNodes)!.delete("b");
    pause = false; calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.resumeOnBoot(); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ ready: true, nodes: 1, processed: 2 });
    expect(calls.some((call) => call.fn === "state::list" || call.scope === KV.graphSnapshot)).toBe(false);
  });

  it("keeps current writer updates, deletes and late inserts while discovery is running", async () => {
    const { controller, kv, rows, intercept } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")], ["b", node("b")]]));
    const entered = deferred(); const release = deferred();
    intercept(async (fn, payload) => {
      if (fn === "state::list" && payload.scope === KV.graphEdgeHistory) { entered.resolve(); await release.promise; }
    });
    await controller.start({ allowLegacyScan: true }); await entered.promise;
    await kv.set(KV.graphNodes, "a", { ...node("a"), name: "current" });
    await kv.delete(KV.graphNodes, "b");
    await kv.set(KV.graphNodes, "late", node("late"));
    release.resolve(); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ ready: true, nodes: 2, total: 2 });
    const reader = (await createGraphIndexReader(kv))!;
    expect(await reader.getNode("a")).toHaveProperty("name", "current");
    expect(await reader.getNode("b")).toBeNull();
    expect(await reader.getNode("late")).toHaveProperty("id", "late");
  });

  it("retries an interrupted build initialization only with renewed discovery consent", async () => {
    const { controller, kv, rows, calls, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")]]));
    intercept((fn, payload) => { if (fn === "state::set" && payload.scope === KV.graphRetrievalControl) throw new Error("initialize failure"); });
    await expect(controller.start({ allowLegacyScan: true })).rejects.toThrow("initialize failure");
    expect(await kv.get(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY)).toMatchObject({ sealed: false });
    intercept(); calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.resumeOnBoot();
    await expect(restarted.start({ resume: true })).rejects.toThrow("authorize another complete legacy scan");
    expect(calls.some((call) => call.fn === "state::list")).toBe(false);
    await restarted.start({ resume: true, allowLegacyScan: true }); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ ready: true, nodes: 1 });
  });

  it("replays an unacknowledged cursor idempotently", async () => {
    const { controller, kv, rows, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")], ["b", node("b")]]));
    intercept((fn, payload) => {
      if (fn === "state::set" && payload.scope === KV.graphIndexMigration && payload.value.processed > 0) throw new Error("progress not persisted");
    });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await kv.get<GraphIndexMigration>(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY)).toMatchObject({ sealed: true, processed: 0 });
    intercept();
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.start({ resume: true }); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ ready: true, nodes: 2, processed: 2 });
  });

  it.each(["missing", "checksum", "oversized"])("pauses a %s sealed manifest instead of publishing incomplete coverage", async (corruption) => {
    const { controller, kv, rows, intercept } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")]]));
    intercept((fn, payload) => { if (fn === "state::get" && payload.scope === KV.graphIndexManifest) throw new Error("interrupt"); });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    intercept();
    const job = (await kv.get<GraphIndexMigration>(KV.graphIndexMigration, GRAPH_INDEX_MIGRATION_KEY))!;
    const key = graphIndexManifestKey(job.jobId, "nodes", 0);
    if (corruption === "missing") rows.get(KV.graphIndexManifest)!.delete(key);
    else {
      const page = rows.get(KV.graphIndexManifest)!.get(key) as GraphIndexManifestPage;
      if (corruption === "checksum") page.ids[0] = "different";
      else page.ids = Array.from({ length: 129 }, () => "a");
    }
    await controller.start({ resume: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ ready: false, state: "paused", error: expect.stringContaining("manifest") });
    expect((await getGraphIndexStatus(kv))?.status).toBe("building");
  });

  it("keeps late discovery out of a reset generation", async () => {
    const { controller, kv, rows, intercept } = setup();
    rows.set(KV.graphNodes, new Map([["old", node("old")]]));
    const entered = deferred(); const release = deferred();
    intercept(async (fn, payload) => { if (fn === "state::list" && payload.scope === KV.graphNodes) { entered.resolve(); await release.promise; } });
    await controller.start({ allowLegacyScan: true }); await entered.promise;
    await resetGraphGeneration(kv, { version: 1, topNodes: [], topEdges: [], topDegrees: {}, stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {} }, updatedAt: now, dirty: false });
    release.resolve(); await controller.waitForIdle();
    expect(rows.get(KV.graphIndexMigration)?.get(GRAPH_INDEX_MIGRATION_KEY)).toMatchObject({ state: "superseded" });
    expect((await controller.status()).jobId).toBeUndefined();
    expect((await controller.status()).nodes ?? 0).toBe(0);
  });

  it("defers sealed legacy journal recovery at boot and permits an explicit replacement build", async () => {
    const { controller, kv, rows, calls, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")]]));
    intercept((fn, payload) => { if (fn === "state::get" && payload.scope === KV.graphIndexManifest) throw new Error("interrupt"); });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    intercept();
    const original = (await controller.status()).jobId;
    const control = (await getGraphIndexStatus(kv))!;
    rows.get(KV.graphRetrievalControl)!.set("current", { ...control, batchPending: true });
    rows.set(KV.graphSnapshot, new Map([["current", { version: 1, dirty: true }]]));
    calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await restarted.resumeOnBoot(); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ state: "paused", ready: false, error: expect.stringContaining("explicit") });
    expect(calls.some((call) => call.fn === "state::list" || call.scope === KV.graphSnapshot)).toBe(false);
    await restarted.start({ resume: true }); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ ready: false, action: expect.stringContaining("migrate --allow-legacy-scan"), error: expect.stringContaining("new build") });
    await restarted.start({ allowLegacyScan: true }); await restarted.waitForIdle();
    expect(await restarted.status()).toMatchObject({ ready: true, nodes: 1 });
    expect((await restarted.status()).jobId).not.toBe(original);
  });

  it("does no discovery when durable intent cannot be written", async () => {
    const { controller, calls, intercept } = setup();
    intercept((fn, payload) => { if (fn === "state::set" && payload.scope === KV.graphIndexMigration) throw new Error("disk failure"); });
    await expect(controller.start({ allowLegacyScan: true })).rejects.toThrow("disk failure");
    expect(calls.some((call) => call.fn === "state::list")).toBe(false);
  });

  it("never reuses orphaned journals when a sealed build loses its control", async () => {
    const { controller, kv, rows, calls, intercept, sdk } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")], ["b", node("b")]]));
    intercept((fn, payload) => { if (fn === "state::get" && payload.scope === KV.graphNodes && payload.key === "b") throw new Error("interrupt"); });
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const old = await controller.status();
    expect(old).toMatchObject({ sealed: true, processed: 1 });
    rows.get(KV.graphRetrievalControl)!.delete("current");
    intercept(); calls.length = 0;
    const restarted = new GraphIndexMigrationController(new StateKV(sdk as never));
    await expect(restarted.resumeOnBoot()).rejects.toThrow("sealed build control is missing");
    await expect(restarted.start({ resume: true, allowLegacyScan: true })).rejects.toThrow("sealed build control is missing");
    await expect(restarted.start()).rejects.toThrow("allowLegacyScan");
    expect(calls.some((call) => call.fn === "state::set" || call.fn === "state::list")).toBe(false);
    await restarted.start({ allowLegacyScan: true }); await restarted.waitForIdle();
    const ready = await restarted.status();
    expect(ready).toMatchObject({ ready: true, nodes: 2, processed: 2, coverage: "complete" });
    expect(ready.buildId).not.toBe(old.buildId); expect(ready.jobId).not.toBe(old.jobId);
    const reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("nodes", "")).ids.sort()).toEqual(["a", "b"]);
    expect(await reader.finish()).toBe(true);
  });

  it.each(["corrupt", "older-schema"])("repairs %s derived control only through an explicit new migration", async (kind) => {
    const { controller, rows, calls, intercept } = setup();
    rows.set(KV.graphNodes, new Map([["a", node("a")]]));
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    const old = (await controller.status()).jobId;
    const control = rows.get(KV.graphRetrievalControl)!.get("current") as object;
    rows.get(KV.graphRetrievalControl)!.set("current", kind === "corrupt" ? { schema: 999 } : { ...control, schema: 1 });
    calls.length = 0;
    expect(await controller.status()).toMatchObject({
      state: "unavailable", ready: false,
      error: "Invalid graph retrieval index control; run explicit graph-index migration",
    });
    await expect(controller.start({ resume: true })).rejects.toThrow();
    await expect(controller.start()).rejects.toThrow();
    expect(calls.every((call) => call.fn === "state::get")).toBe(true);
    calls.length = 0;
    intercept((fn, payload) => { if (fn === "state::get" && payload.scope === KV.graphRetrievalControl) throw new Error("storage offline"); });
    expect(await controller.status()).toMatchObject({
      state: "unavailable", ready: false,
      error: "Graph index migration stopped after a storage failure. Check the server and resume when storage is available.",
    });
    await expect(controller.start({ allowLegacyScan: true })).rejects.toThrow("storage offline");
    expect(calls.some((call) => call.fn === "state::set" || call.fn === "state::list")).toBe(false);
    intercept();
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ ready: true, nodes: 1 });
    expect((await controller.status()).jobId).not.toBe(old);
  });

  it("fails closed for corrupt descriptors and oversized legacy IDs", async () => {
    const { controller, rows, calls } = setup();
    rows.set(KV.graphIndexMigration, new Map([[GRAPH_INDEX_MIGRATION_KEY, { schema: 999 }]]));
    expect(await controller.status()).toMatchObject({ state: "unavailable", ready: false });
    await expect(controller.start({ allowLegacyScan: true })).rejects.toThrow("state is invalid");
    expect(calls.some((call) => call.fn === "state::list")).toBe(false);
    rows.delete(KV.graphIndexMigration);
    const id = "x".repeat(1025); rows.set(KV.graphNodes, new Map([[id, node(id)]]));
    await controller.start({ allowLegacyScan: true }); await controller.waitForIdle();
    expect(await controller.status()).toMatchObject({ state: "paused", sealed: false, error: expect.stringContaining("oversized ID") });
  });
});

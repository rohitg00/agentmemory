import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Memory } from "../../src/types.js";
import { fingerprint } from "./fingerprint.js";
import { lifecycleFixture as fixture, commandFromRetrievedText } from "./lifecycle-fixture.js";
import { startSandbox, type LocalSandbox } from "./sandbox.js";

type Hit = { obsId?: string; observation?: { id: string; narrative: string } };
interface Check { name: string; status: "pass" | "fail"; ms: number; receipt?: unknown; error?: string }

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string",
    default: "eval/reports/lifecycle-" + new Date().toISOString().replace(/[:.]/g, "-") } } });
  const out = resolve(values.out);
  if (existsSync(out) && readdirSync(out).length) throw new Error("Output directory is not empty: " + out);
  mkdirSync(out, { recursive: true });
  const checks: Check[] = [];
  const manifest = { schemaVersion: 1, benchmark: fixture.version, startedAt: new Date().toISOString(),
    source: fingerprint(true), fixture,
    scope: "Local HTTP lifecycle assertions with a deterministic command reader; no LLM or command execution",
    planned: 11, provider: "noop", embeddings: false, consolidation: false };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  async function check(name: string, run: () => Promise<unknown>): Promise<void> {
    const start = performance.now();
    let result: Check;
    try { result = { name, status: "pass", ms: 0, receipt: await run() }; }
    catch (error) { result = { name, status: "fail", ms: 0, error: error instanceof Error ? error.message : String(error) }; }
    result.ms = performance.now() - start;
    checks.push(result);
    appendFileSync(join(out, "checks.ndjson"), JSON.stringify(result) + "\n");
    console.log(result.status + " " + name);
  }
  let sandbox: LocalSandbox | undefined;
  try {
    sandbox = await startSandbox();
    const store = sandbox;
    async function remember(content: string, project = fixture.project, sourceObservationIds: string[] = []): Promise<Memory> {
      const result = await store.request<{ success: boolean; memory: Memory }>("/remember", { content, project, sourceObservationIds, type: "fact" });
      assert.equal(result.success, true);
      assert.ok(result.memory?.id);
      return result.memory;
    }
    async function search(query: string, project = fixture.project, smart = false): Promise<Hit[]> {
      const result = await store.request<{ results: Hit[] }>(smart ? "/smart-search" : "/search", {
        query, project, limit: 20, format: "full", includeLessons: false,
      });
      assert.ok(Array.isArray(result.results));
      return result.results;
    }
    const id = (hit: Hit): string | undefined => hit.observation?.id ?? hit.obsId;
    const initial = await remember(fixture.oldPolicy);
    const other = await remember(fixture.otherPolicy, fixture.otherProject);
    const disposable = await remember(fixture.disposable);
    let latest = initial;
    await check("positive-recall-control", async () => {
      const hits = await search("dependency installation policy", fixture.project, true);
      assert.ok(hits.some((hit) => id(hit) === initial.id));
      return { expected: initial.id, returned: hits.map(id) };
    });
    await check("supersession-removes-stale-recall", async () => {
      latest = await remember(fixture.newPolicy);
      assert.equal(latest.version, 2);
      assert.deepEqual(latest.supersedes, [initial.id]);
      const old = await store.request<{ memory: Memory }>("/memories/" + initial.id);
      assert.equal(old.memory.isLatest, false);
      const hits = await search("dependency installation policy");
      assert.ok(hits.some((hit) => id(hit) === latest.id));
      assert.ok(hits.every((hit) => id(hit) !== initial.id));
      return { old: initial.id, latest: latest.id, returned: hits.map(id) };
    });
    await check("smart-search-project-isolation", async () => {
      const control = await search("dependency installation policy", fixture.otherProject);
      assert.ok(control.some((hit) => id(hit) === other.id));
      const hits = await search("dependency installation policy", fixture.project, true);
      assert.ok(hits.some((hit) => id(hit) === latest.id));
      assert.ok(hits.every((hit) => id(hit) !== other.id), "smart search returned another project's memory: " + JSON.stringify(hits.map(id)));
      return { positiveControl: other.id, returned: hits.map(id) };
    });
    await check("compact-memory-expands-to-full-content", async () => {
      const compact = await search("dependency installation policy", fixture.project, true);
      assert.ok(compact.some((hit) => id(hit) === latest.id));
      const expanded = await store.request<{ results: Hit[] }>("/smart-search", { expandIds: [latest.id], project: fixture.project });
      const recovered = expanded.results.find((hit) => id(hit) === latest.id);
      assert.equal(recovered?.observation?.narrative, fixture.newPolicy, "durable memory expansion must recover the complete stored policy");
      return { memoryId: latest.id, expanded: recovered };
    });
    await check("forget-has-positive-witness-and-preserves-neighbor", async () => {
      assert.ok((await search("kestrel beacon")).some((hit) => id(hit) === disposable.id));
      const forgotten = await store.request<{ deleted: number; failed: number; cleanupFailed: number }>("/forget", { memoryId: disposable.id });
      assert.equal(forgotten.deleted, 1);
      assert.equal(forgotten.failed, 0);
      assert.equal(forgotten.cleanupFailed, 0);
      assert.ok((await search("kestrel beacon")).every((hit) => id(hit) !== disposable.id));
      const all = await store.request<{ memories: Memory[] }>("/memories");
      assert.ok(all.memories.every((memory) => memory.id !== disposable.id));
      assert.ok(all.memories.some((memory) => memory.id === other.id));
      return forgotten;
    });
    await check("capture-and-source-provenance", async () => {
      const sessionId = "eval-capture-orbit";
      const receipt = await store.request("/observe", { hookType: "prompt_submit", sessionId, project: fixture.project,
        cwd: store.directory, eventId: "eval-event-1", timestamp: "2025-01-02T12:00:00Z", data: { prompt: fixture.captured } });
      let observations: Array<{ id: string; narrative: string }> = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        const response = await store.request<{ observations: typeof observations }>("/observations?sessionId=" + sessionId);
        observations = response.observations;
        if (observations.some((observation) => observation.narrative.includes(fixture.captured))) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
      const observed = observations.find((observation) => observation.narrative.includes(fixture.captured));
      assert.ok(observed, "capture must produce the expected observation, not merely acknowledge the request");
      const memory = await remember("Release readiness depends on the lighthouse route smoke check.", fixture.project, [observed.id]);
      const persisted = await store.request<{ memory: Memory }>("/memories/" + memory.id);
      assert.deepEqual(persisted.memory.sourceObservationIds, [observed.id]);
      return { capture: receipt, observationId: observed.id, memoryId: memory.id };
    });
    await check("restart-preserves-latest-and-forgotten-state", async () => {
      await store.restart();
      const hits = await search("dependency installation policy");
      assert.ok(hits.some((hit) => id(hit) === latest.id));
      assert.ok(hits.every((hit) => id(hit) !== initial.id));
      const all = await store.request<{ memories: Memory[] }>("/memories");
      assert.ok(all.memories.every((memory) => memory.id !== disposable.id));
      return { returned: hits.map(id), memoryCount: all.memories.length };
    });
    await check("reader-abstains-without-memory", async () => {
      assert.equal(commandFromRetrievedText([]), null);
      return { selectedCommand: null };
    });
    await check("reader-abstains-on-conflicting-memory", async () => {
      const a = await search("dependency installation policy");
      const b = await search("dependency installation policy", fixture.otherProject);
      assert.ok(a.some((hit) => id(hit) === latest.id), "conflict control requires the Orbit policy");
      assert.ok(b.some((hit) => id(hit) === other.id), "conflict control requires the Quartz policy");
      const selected = commandFromRetrievedText([...a, ...b].map((hit) => hit.observation?.narrative ?? ""));
      assert.equal(selected, null);
      return { selectedCommand: selected, sourceIds: [...a, ...b].map(id) };
    });
    await check("retrieved-command-creates-action-with-provenance", async () => {
      const hits = await search("dependency installation policy");
      const selected = commandFromRetrievedText(hits.map((hit) => hit.observation?.narrative ?? ""));
      assert.equal(selected, "pnpm install --frozen-lockfile");
      const sources = hits.filter((hit) => hit.observation?.narrative.includes("Approved command:")).map(id);
      assert.deepEqual(sources, [latest.id]);
      const created = await store.request<{ action: { id: string } }>("/actions", {
        title: "Install Orbit dependencies", description: selected, project: fixture.project, sourceMemoryIds: sources,
      });
      const persisted = await store.request<{ action: { description: string; sourceMemoryIds: string[] } }>("/actions/get?actionId=" + created.action.id);
      assert.equal(persisted.action.description, selected);
      assert.deepEqual(persisted.action.sourceMemoryIds, sources);
      return { actionId: created.action.id, ...persisted.action };
    });
  } catch (error) {
    await check("setup-or-infrastructure", async () => { throw error; });
  } finally {
    await check("sandbox-cleanup", async () => { await sandbox?.close(); return { stopped: true }; });
    const failed = checks.filter((check) => check.status === "fail").length;
    const summary = { planned: manifest.planned, executed: checks.length, passed: checks.length - failed, failed,
      complete: checks.length === manifest.planned, finishedAt: new Date().toISOString(),
      claim: "Development regression fixture. No competitor ranking or agent task-success claim." };
    writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    if (failed || !summary.complete) process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

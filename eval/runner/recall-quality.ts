import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CompressedObservation, Memory, Session } from "../../src/types.js";
import { VERSION } from "../../src/version.js";
import { fingerprint } from "./fingerprint.js";
import { startSandbox, type LocalSandbox } from "./sandbox.js";

type Hit = { obsId?: string; observation?: CompressedObservation; layer?: string; content_truncated?: boolean };
interface Recall {
  results: Hit[];
  matched_count: number;
  excluded_by_budget: number;
  excluded_results: Array<{ obsId: string }>;
  minimum_budget?: number;
  tokens_used: number;
  truncated: boolean;
}
interface Check { name: string; status: "pass" | "fail"; receipt?: unknown; error?: string }

const project = "recall-eval-orbit";
const timestamp = "2026-01-01T00:00:00Z";
const queries = ["quasar routing", "cedar deployment", "marble authentication", "cobalt storage", "saffron tracing"];
const sessions: Session[] = queries.map((_, i) => ({ id: `ses_recall_${i}`, project, cwd: "/synthetic/orbit",
  startedAt: timestamp, status: "completed", observationCount: 360 }));
const observations: Record<string, CompressedObservation[]> = Object.fromEntries(sessions.map((session, i) => [
  session.id, Array.from({ length: 360 }, (_, n) => ({ id: `obs_recall_${i}_${n}`, sessionId: session.id,
    timestamp, type: "command_run" as const, title: "Bash", narrative: `${queries[i]} command output ${n}`,
    facts: [], concepts: [], files: [], importance: 5, confidence: 0.3 })),
]));
const memories: Memory[] = queries.map((query, i) => ({ id: `mem_recall_${i}`, createdAt: timestamp,
  updatedAt: timestamp, type: "architecture", title: `${query} decision savedpolicy${i}`,
  content: `${query}: keep the approved policy. ` + "The design records explicit assumptions, operational constraints, and the rollback procedure. ".repeat(90),
  concepts: [], files: [], sessionIds: [], strength: 8, version: 1, isLatest: true, project }));
const privateMemory: Memory = { ...memories[0], id: "mem_recall_private", project: "recall-eval-other",
  title: "Private quasar routing policy savedpolicy0", content: "quasar routing private policy" };
const id = (hit: Hit): string | undefined => hit.obsId ?? hit.observation?.id;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string",
    default: "eval/reports/recall-" + new Date().toISOString().replace(/[:.]/g, "-") } } });
  const out = resolve(values.out);
  if (existsSync(out) && readdirSync(out).length) throw new Error("Output directory is not empty: " + out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ benchmark: "saved-memory-recall-v1", source: fingerprint(true),
    fixture: { observations: 1800, savedMemories: 5, privateControl: 1, observationsPerSavedMemory: 360, queries },
    scope: "Synthetic retrieval and budget regression; noop provider, no embeddings or model calls" }, null, 2) + "\n");
  const checks: Check[] = [];
  async function check(name: string, run: () => Promise<unknown>): Promise<void> {
    let result: Check;
    try { result = { name, status: "pass", receipt: await run() }; }
    catch (error) { result = { name, status: "fail", error: error instanceof Error ? error.message : String(error) }; }
    checks.push(result);
    appendFileSync(join(out, "checks.ndjson"), JSON.stringify(result) + "\n");
    console.log(result.status + " " + name);
  }
  let sandbox: LocalSandbox | undefined;
  const planned = queries.length * 2 + 9;
  try {
    sandbox = await startSandbox();
    const store = sandbox;
    await store.request("/import", { exportData: { version: VERSION, exportedAt: timestamp,
      sessions, observations, memories: [...memories, privateMemory], summaries: [] } });
    for (const [i, query] of queries.entries()) {
      for (const path of ["/search", "/smart-search"]) {
        await check(path.slice(1) + "-saved-memory-" + i, async () => {
          const mixed = await store.request<Recall>(path, { query, project, limit: 5 });
          assert.ok(!mixed.results.some((hit) => id(hit) === memories[i].id), "noise control must crowd out the saved memory");
          const filtered = await store.request<Recall>(path, { query, project, limit: 5, targetLayer: "memory" });
          assert.ok(filtered.results.some((hit) => id(hit) === memories[i].id));
          assert.ok(filtered.results.every((hit) => hit.layer === "memory"));
          assert.ok(filtered.results.every((hit) => id(hit) !== privateMemory.id));
          return { mixedIds: mixed.results.map(id), memoryIds: filtered.results.map(id), expected: memories[i].id };
        });
      }
    }
    for (const format of ["full", "compact", "narrative"]) {
      await check("budget-and-mcp-" + format, async () => {
        const args = { query: "savedpolicy0", project, targetLayer: "memory", format, token_budget: 900 };
        const response = await store.request<Recall>("/search", args);
        assert.equal(id(response.results[0]), memories[0].id);
        assert.equal(response.matched_count, 1);
        assert.ok(response.tokens_used <= 900);
        if (format !== "compact") assert.equal(response.results[0].content_truncated, true);
        const mcp = await store.request<{ content: Array<{ text: string }> }>("/mcp/call", { name: "memory_recall", arguments: args });
        const wire = JSON.parse(mcp.content[0].text) as Recall;
        assert.equal(id(wire.results[0]), memories[0].id);
        assert.equal(wire.matched_count, 1);
        assert.deepEqual(wire, response);
        return { id: id(wire.results[0]), tokens: wire.tokens_used, clipped: wire.results[0].content_truncated ?? false };
      });
    }
    await check("tiny-budget-has-scoped-recovery-reference", async () => {
      const result = await store.request<Recall>("/search", { query: "savedpolicy0", project, targetLayer: "memory", token_budget: 1 });
      assert.deepEqual(result.results, []);
      assert.equal(result.matched_count, 1);
      assert.equal(result.excluded_by_budget, 1);
      assert.ok((result.minimum_budget ?? 0) > 1);
      assert.deepEqual(result.excluded_results.map((hit) => hit.obsId), [memories[0].id]);
      const mcp = await store.request<{ content: Array<{ text: string }> }>("/mcp/call", {
        name: "memory_recall", arguments: { query: "savedpolicy0", project, targetLayer: "memory", token_budget: 1 },
      });
      assert.deepEqual(JSON.parse(mcp.content[0].text), result);
      return result;
    });
    await check("mcp-expansion-recovers-complete-memory", async () => {
      const response = await store.request<{ content: Array<{ text: string }> }>("/mcp/call", {
        name: "memory_smart_search", arguments: { expandIds: memories[0].id, targetLayer: "memory", project },
      });
      const expanded = JSON.parse(response.content[0].text) as Recall;
      assert.equal(expanded.results[0]?.observation?.narrative, memories[0].content);
      return { id: id(expanded.results[0]), recoveredCharacters: memories[0].content.length };
    });
    await check("empty-query-match-is-distinct-from-budget-exclusion", async () => {
      const response = await store.request<Recall>("/search", { query: "nonexistentuniquelexeme", targetLayer: "memory", token_budget: 1 });
      assert.deepEqual(response.results, []);
      assert.equal(response.matched_count, 0);
      assert.equal(response.excluded_by_budget, 0);
      assert.equal(response.truncated, false);
      return response;
    });
    await check("observation-layer-remains-searchable", async () => {
      const response = await store.request<Recall>("/smart-search", { query: queries[0], project, targetLayer: "observation", limit: 5 });
      assert.equal(response.results.length, 5);
      assert.ok(response.results.every((hit) => hit.layer === "observation"));
      return { ids: response.results.map(id) };
    });
    await check("restart-preserves-memory-filter-and-content", async () => {
      await store.restart();
      const response = await store.request<Recall>("/search", { query: queries[0], project, targetLayer: "memory" });
      assert.equal(response.results[0]?.observation?.narrative, memories[0].content);
      return { ids: response.results.map(id) };
    });
  } catch (error) {
    await check("setup-or-infrastructure", async () => { throw error; });
  } finally {
    await check("sandbox-cleanup", async () => { await sandbox?.close(); return { stopped: true }; });
    const failed = checks.filter((entry) => entry.status === "fail").length;
    const summary = { planned, executed: checks.length, passed: checks.length - failed, failed,
      complete: checks.length === planned, claim: "Synthetic regression fixture, not a competitor or answer-quality benchmark" };
    writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    if (failed || !summary.complete) process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

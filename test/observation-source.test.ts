import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CompressedObservation, ExportData, HookType, MemoryProvider, RawObservation } from "../src/types.js";
import { KV } from "../src/state/schema.js";
import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { registerTimelineFunction } from "../src/functions/timeline.js";
import { registerTeamFunction } from "../src/functions/team.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { getSearchIndex, registerSearchFunction, setEmbeddingProvider, setVectorIndex } from "../src/functions/search.js";
import { createObservationSource, OBSERVATION_SOURCE_MAX_BYTES } from "../src/functions/observation-source.js";
import { buildSummaryPrompt } from "../src/prompts/summary.js";
import { budgetImportedObservationSources, SESSION_SOURCE_MAX_BYTES } from "../src/functions/observation-source-budget.js";
import { payloadByteLength, SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Handler = (data: any) => Promise<any>;

function rig() {
  const store = new Map<string, Map<string, any>>();
  const handlers = new Map<string, Handler>();
  const pendingCompression: Promise<unknown>[] = [];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const kv = {
    get: async (scope: string, key: string) => clone(store.get(scope)?.get(key) ?? null),
    set: async (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, clone(value));
      return value;
    },
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const value = store.get(scope)?.get(key);
      for (const update of updates) value[update.path] = clone(update.value);
      return value;
    },
    list: async (scope: string) => clone(Array.from(store.get(scope)?.values() ?? [])),
    delete: async (scope: string, key: string) => { store.get(scope)?.delete(key); },
  };
  const sdk = {
    registerFunction: (id: string, handler: Handler) => handlers.set(id, handler),
    registerTrigger: () => {},
    on: () => {},
    trigger: vi.fn(async (input: { function_id: string; payload: unknown }) => {
      const result = handlers.get(input.function_id)?.(input.payload);
      if (input.function_id === "mem::compress") {
        if (result) pendingCompression.push(result);
        return;
      }
      return result;
    }),
  };
  registerObserveFunction(sdk as never, kv as never);
  registerReplayFunctions(sdk as never, kv as never);
  registerExportImportFunction(sdk as never, kv as never);
  registerSearchFunction(sdk as never, kv as never);
  registerSmartSearchFunction(sdk as never, kv as never, async () => []);
  registerTimelineFunction(sdk as never, kv as never);
  registerTeamFunction(sdk as never, kv as never, { teamId: "source-team", userId: "source-user", mode: "shared" });
  registerApiTriggers(sdk as never, kv as never);
  const call = (id: string, payload: unknown) => handlers.get(id)!(payload);
  const observe = async (hookType: HookType, data: unknown) => {
    const result = await call("mem::observe", {
      sessionId: "source-session", project: "source-test", cwd: "/test/project",
      timestamp: "2026-09-30T00:00:00Z", hookType, data,
    });
    await Promise.all(pendingCompression.splice(0));
    return kv.get(KV.observations("source-session"), result.observationId) as Promise<CompressedObservation>;
  };
  return { kv, sdk, call, observe };
}

const raw = (overrides: Partial<RawObservation>): RawObservation => ({
  id: "obs-source", sessionId: "source-session", timestamp: "2026-09-30T00:00:00Z",
  hookType: "post_tool_use", raw: {}, ...overrides,
});

beforeEach(() => {
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
  getSearchIndex().clear();
  setVectorIndex(null);
  setEmbeddingProvider(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("retained observation source", () => {
  it("preserves sanitized long prompts, tool results and responses through export/import and replay", async () => {
    const { observe, call } = rig();
    const tail = "deployment-port-19091";
    const long = `prefix ${"detail ".repeat(180)} ${tail}`;
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
    const prompt = await observe("prompt_submit", { prompt: long });
    const tool = await observe("post_tool_use", {
      tool_name: "Read", tool_input: { file_path: "config.ts" },
      tool_output: `${long} <private>private-canary</private> ${secret}`,
    });
    const response = await observe("stop", { assistant_response: long });
    expect(prompt.narrative).toHaveLength(400);
    expect(prompt.source?.userPrompt).toBe(long);
    expect(tool.source?.toolOutput).toContain(tail);
    expect(response.source?.assistantResponse).toBe(long);
    expect(tool.source).not.toHaveProperty("raw");
    expect(tool.source).not.toHaveProperty("payload");
    expect(JSON.stringify(tool).split(tail)).toHaveLength(2);
    expect(JSON.stringify(tool)).not.toContain("private-canary");
    expect(JSON.stringify(tool)).not.toContain(secret);
    const exported = JSON.parse(JSON.stringify(await call("mem::export", {}))) as ExportData;
    expect(exported.observations["source-session"]).toHaveLength(3);
    const fresh = rig();
    expect(await fresh.call("mem::import", { exportData: exported })).toMatchObject({ success: true, observations: 3 });
    const replay = await fresh.call("mem::replay::load", { sessionId: "source-session" });
    expect(replay.timeline.events.map((event: any) => event.kind)).toEqual(["prompt", "tool_result", "response"]);
    expect(replay.timeline.events[0].body).toBe(long);
    expect(replay.timeline.events[1].toolOutput).toBe(tool.source?.toolOutput);
    expect(replay.timeline.events[2].body).toBe(long);
    expect(replay.sourceRetention.every((entry: any) => entry.retained && !entry.truncated)).toBe(true);
  });

  it("keeps retained source out of search, expansion, listings, timeline and summary prompts", async () => {
    const { observe, call, sdk } = rig();
    const tail = "SOURCE_ONLY_TAIL_951";
    const observation = await observe("post_tool_use", {
      tool_name: "Read", tool_input: { file_path: "config.ts" }, tool_output: `${"config ".repeat(200)}${tail}`,
    });
    const responses = [
      await call("mem::search", { query: "Read" }),
      await call("mem::smart-search", { expandIds: [{ obsId: observation.id, sessionId: observation.sessionId }] }),
      await call("mem::timeline", { anchor: observation.timestamp }),
      await call("api::observations", { headers: {}, query_params: { sessionId: observation.sessionId } }),
      await call("api::observations", { headers: {}, query_params: { sessionId: observation.sessionId, limit: "1" } }),
    ];
    for (const response of responses) {
      expect(JSON.stringify(response)).toContain(observation.id);
      expect(JSON.stringify(response)).not.toContain('"source":');
      expect(JSON.stringify(response)).not.toContain(tail);
    }
    expect(buildSummaryPrompt([observation])).not.toContain(tail);
    const updates = sdk.trigger.mock.calls.map(([input]) => input)
      .filter((input) => input.function_id === "stream::set");
    expect(updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(updates)).not.toContain(tail);
  });

  it("preserves source when model compression succeeds without returning it to the model caller or viewer", async () => {
    const r = rig();
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    const provider: MemoryProvider = {
      name: "test", summarize: vi.fn(),
      compress: vi.fn(async () => "<type>file_read</type><title>Read configuration</title><facts><fact>Port configured</fact></facts><narrative>Read the configuration file.</narrative><concepts><concept>config</concept></concepts><files></files><importance>5</importance>"),
    };
    registerCompressFunction(r.sdk as never, r.kv as never, provider);
    const tail = "MODEL_SOURCE_ONLY_TAIL";
    const saved = await r.observe("post_tool_use", {
      tool_name: "Read", tool_input: { file_path: "config.ts" }, tool_output: `${"detail ".repeat(1000)}${tail}`,
    });
    expect(saved.source?.toolOutput).toContain(tail);
    expect(saved.narrative).not.toContain(tail);
    expect(provider.compress).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(provider.compress).mock.calls)).not.toContain(tail);
    const updates = r.sdk.trigger.mock.calls.map(([input]) => input)
      .filter((input) => input.function_id === "stream::send" && (input.payload as any).type === "compressed_observation");
    expect(updates.length).toBe(1);
    expect(JSON.stringify(updates)).not.toContain(tail);
  });

  it("leaves sanitized stored source intact when model compression fails", async () => {
    const r = rig();
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    const provider: MemoryProvider = {
      name: "test", summarize: vi.fn(), compress: vi.fn(async () => { throw new Error("provider unavailable"); }),
    };
    registerCompressFunction(r.sdk as never, r.kv as never, provider);
    const output = `${"detail ".repeat(200)}retained-after-failure`;
    await r.observe("post_tool_use", { tool_name: "Read", tool_output: output });
    const replay = await r.call("mem::replay::load", { sessionId: "source-session" });
    expect(replay.timeline.events[0].toolOutput).toBe(output);
    expect(replay.sourceRetention[0].retained).toBe(true);
  });

  it("rejects compressed rows passed as raw without calling a model or replacing retained evidence", async () => {
    const r = rig();
    const saved = await r.observe("prompt_submit", { prompt: "preserved evidence" });
    const provider: MemoryProvider = { name: "test", compress: vi.fn(), summarize: vi.fn() };
    registerCompressFunction(r.sdk as never, r.kv as never, provider);
    expect(await r.call("mem::compress", { observationId: saved.id, sessionId: saved.sessionId, raw: saved }))
      .toEqual({ success: false, error: "invalid_raw_observation" });
    expect(provider.compress).not.toHaveBeenCalled();
    expect(await r.kv.get(KV.observations(saved.sessionId), saved.id)).toEqual(saved);
  });

  it("bounds oversized Unicode evidence by serialized bytes and marks the truncation", () => {
    const input = raw({ toolName: "Read", toolOutput: '界😀"\\\n'.repeat(20000) });
    const source = createObservationSource(input);
    const encoded = JSON.stringify(source);
    expect(Buffer.byteLength(encoded, "utf8")).toBeLessThanOrEqual(OBSERVATION_SOURCE_MAX_BYTES);
    expect(source.originalBytes).toBeGreaterThan(OBSERVATION_SOURCE_MAX_BYTES);
    expect(source.truncated).toBe(true);
    expect(JSON.parse(encoded)).toEqual(source);
    expect(createObservationSource(input)).toEqual(source);
    expect(source.toolOutput).not.toMatch(/[\uD800-\uDBFF]$/u);
  });

  it("keeps structured evidence intact within the cap and marks oversized objects as text prefixes", () => {
    const small = { command: "read configuration", count: 0 };
    expect(createObservationSource(raw({ toolInput: small })).toolInput).toEqual(small);
    const large = createObservationSource(raw({ toolInput: { data: "a".repeat(100000) } }));
    expect(large.truncated).toBe(true);
    expect(typeof large.toolInput).toBe("string");
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeLessThanOrEqual(OBSERVATION_SOURCE_MAX_BYTES);
  });

  it.each(["x".repeat(40000), '界😀"\\\n'.repeat(10000)])("keeps 500 near-cap sources plus summaries inside a state response frame", (toolOutput) => {
    const template = buildSyntheticCompression(raw({ toolName: "Read", toolInput: { file_path: "config.ts" }, toolOutput }));
    expect(payloadByteLength(template.source)).toBeGreaterThan(OBSERVATION_SOURCE_MAX_BYTES - 16);
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...template, id: `obs-source-${i}` }));
    const planned = budgetImportedObservationSources(rows);
    expect(planned.success).toBe(true);
    if (!planned.success) return;
    expect(planned.observations[0].source).toEqual(template.source);
    const envelope = { message_type: "invocation_result", invocation_id: "00000000-0000-0000-0000-000000000000", result: planned.observations };
    expect(payloadByteLength(envelope)).toBeLessThan(SAFE_PAYLOAD_BYTES);
  });

  it("budgets 1000 imported records and accounts for retained evidence when merging another batch", async () => {
    const r = rig();
    await r.observe("prompt_submit", { prompt: "seed" });
    const exported = await r.call("mem::export", {}) as ExportData;
    const template = buildSyntheticCompression(raw({ toolName: "Read", toolOutput: "detail ".repeat(5000) }));
    exported.observations[template.sessionId] = Array.from({ length: 1000 }, (_, i) => ({ ...template, id: `bulk-${i}` }));
    const fresh = rig();
    expect(await fresh.call("mem::import", { exportData: exported })).toMatchObject({ success: true, observations: 1000, sourceTruncated: 1000, sourceOmitted: 0 });
    const first = await fresh.kv.list(KV.observations(template.sessionId));
    expect(first.reduce((sum, row) => sum + payloadByteLength(row.source) + 10, 0)).toBeLessThanOrEqual(SESSION_SOURCE_MAX_BYTES);
    expect(payloadByteLength({ result: first })).toBeLessThan(SAFE_PAYLOAD_BYTES);
    exported.observations[template.sessionId] = exported.observations[template.sessionId].map((row) => ({ ...row, id: `next-${row.id}` }));
    expect(await fresh.call("mem::import", { exportData: exported })).toMatchObject({ success: true, observations: 1000, sourceOmitted: 1000 });
    expect(await fresh.kv.get(KV.observations(template.sessionId), first[0].id)).toEqual(first[0]);
    expect(payloadByteLength({ result: await fresh.kv.list(KV.observations(template.sessionId)) })).toBeLessThan(SAFE_PAYLOAD_BYTES);
  });

  it("rejects an oversized replacement before deleting or writing any stored records", async () => {
    const r = rig();
    const saved = await r.observe("prompt_submit", { prompt: "keep original" });
    const exported = await r.call("mem::export", {}) as ExportData;
    exported.observations[saved.sessionId][0].narrative = "x".repeat(SAFE_PAYLOAD_BYTES);
    const writes = vi.spyOn(r.kv, "set");
    const deletes = vi.spyOn(r.kv, "delete");
    expect(await r.call("mem::import", { exportData: exported, strategy: "replace" })).toMatchObject({ success: false, oversized: true });
    expect(writes).not.toHaveBeenCalled();
    expect(deletes).not.toHaveBeenCalled();
    expect(await r.kv.get(KV.observations(saved.sessionId), saved.id)).toEqual(saved);
  });

  it("keeps unequal source sizes intact when their total fits the session budget", () => {
    const short = buildSyntheticCompression(raw({ hookType: "prompt_submit", userPrompt: "short" }));
    const long = buildSyntheticCompression(raw({ hookType: "prompt_submit", userPrompt: "x".repeat(15000) }));
    const rows = [...Array.from({ length: 2999 }, (_, i) => ({ ...short, id: `short-${i}` })), { ...long, id: "long" }];
    const planned = budgetImportedObservationSources(rows);
    expect(planned.success).toBe(true);
    if (!planned.success) return;
    expect(planned.observations[2999].source).toEqual(long.source);
    expect(planned.sourceTruncated).toBe(0);
  });

  it("serializes concurrent imports so both cannot spend the same session source budget", async () => {
    const r = rig();
    await r.observe("prompt_submit", { prompt: "seed" });
    const exported = await r.call("mem::export", {}) as ExportData;
    const template = buildSyntheticCompression(raw({ toolName: "Read", toolOutput: "x".repeat(20000) }));
    const fresh = rig();
    const results = await Promise.all(["first", "second"].map((prefix) => fresh.call("mem::import", {
      exportData: { ...exported, observations: { [template.sessionId]: Array.from({ length: 600 }, (_, i) => ({ ...template, id: `${prefix}-${i}` })) } },
    })));
    expect(results.every((result) => result.success)).toBe(true);
    const rows = await fresh.kv.list(KV.observations(template.sessionId));
    expect(rows).toHaveLength(1200);
    expect(rows.reduce((sum, row) => sum + (row.source ? payloadByteLength(row.source) + 10 : 0), 0)).toBeLessThanOrEqual(SESSION_SOURCE_MAX_BYTES);
    expect(payloadByteLength({ result: rows })).toBeLessThan(SAFE_PAYLOAD_BYTES);
  });

  it("refuses a replay result that expands beyond the transport frame", async () => {
    const r = rig();
    const template = buildSyntheticCompression(raw({ toolName: "tool".repeat(10000) }));
    for (let i = 0; i < 500; i++) {
      const row = { ...template, id: `large-label-${i}` };
      await r.kv.set(KV.observations(row.sessionId), row.id, row);
    }
    expect(await r.call("mem::replay::load", { sessionId: template.sessionId })).toMatchObject({ success: false, oversized: true });
  });

  it("bounds unrecognized hook metadata as well as the retained payload", () => {
    const hookType = "😀".repeat(30000) as HookType;
    const source = createObservationSource(raw({ hookType, raw: { event: "retained" } }));
    expect(Buffer.byteLength(JSON.stringify(source), "utf8")).toBeLessThanOrEqual(OBSERVATION_SOURCE_MAX_BYTES);
    expect(Buffer.byteLength(source.hookType, "utf8")).toBeLessThanOrEqual(128);
    expect(source.originalBytes).toBeGreaterThan(100000);
    expect(source.truncated).toBe(true);
    expect(source.payload).toEqual({ event: "retained" });
  });

  it("reapplies privacy and byte bounds to imported evidence and preserves truncation metadata", async () => {
    const r = rig();
    const saved = await r.observe("prompt_submit", { prompt: "summary" });
    const exported = await r.call("mem::export", {}) as ExportData;
    exported.observations[saved.sessionId][0].source = {
      hookType: "prompt_submit", originalBytes: 999999, truncated: true,
      userPrompt: `<private>import-private</private>${"界".repeat(100000)}`,
    };
    const fresh = rig();
    await fresh.call("mem::import", { exportData: exported });
    const imported = await fresh.kv.get(KV.observations(saved.sessionId), saved.id);
    expect(imported.source.originalBytes).toBe(999999);
    expect(imported.source.truncated).toBe(true);
    expect(JSON.stringify(imported.source)).not.toContain("import-private");
    expect(Buffer.byteLength(JSON.stringify(imported.source), "utf8")).toBeLessThanOrEqual(OBSERVATION_SOURCE_MAX_BYTES);
    const replay = await fresh.call("mem::replay::load", { sessionId: saved.sessionId });
    expect(replay.sourceRetention[0]).toMatchObject({ retained: true, truncated: true, originalBytes: 999999 });
  });

  it("shares observation summaries without retaining or returning their source in the team feed", async () => {
    const r = rig();
    const saved = await r.observe("post_tool_use", { tool_name: "Read", tool_output: `${"config ".repeat(200)}team-source-tail` });
    const shared = await r.call("mem::team-share", { itemId: saved.id, itemType: "observation", sessionId: saved.sessionId });
    expect(shared.sharedItem.content.source).toBeUndefined();
    expect((await r.kv.get(KV.teamShared("source-team"), shared.sharedItem.id)).content.source).toBeUndefined();
    await r.kv.set(KV.teamShared("source-team"), "old-share", { ...shared.sharedItem, id: "old-share", content: saved });
    const memory = { id: "mem-source", title: "memory", content: "untouched", source: "user-authored metadata" };
    await r.kv.set(KV.memories, memory.id, memory);
    const sharedMemory = await r.call("mem::team-share", { itemId: memory.id, itemType: "memory" });
    expect(sharedMemory.sharedItem.content).toEqual(memory);
    const feed = await r.call("mem::team-feed", {});
    expect(feed.items.find((item: any) => item.type === "memory").content).toEqual(memory);
    expect(feed.items.filter((item: any) => item.type === "observation").every((item: any) => item.content.source === undefined)).toBe(true);
    expect(JSON.stringify(feed)).not.toContain("team-source-tail");
  });

  it("retains sanitized unknown-hook payloads without inventing tool or prompt fields", async () => {
    const { observe, call } = rig();
    const saved = await observe("notification", { message: "visible <private>hidden</private>", status: "ready" });
    expect(saved.source?.payload).toEqual({ message: "visible [REDACTED]", status: "ready" });
    expect(saved.source?.hookType).toBe("notification");
    expect(saved.source?.toolInput).toBeUndefined();
    const replay = await call("mem::replay::load", { sessionId: saved.sessionId });
    expect(replay.timeline.events[0].body).toContain("visible [REDACTED]");
  });

  it("retains imported prompt and response evidence once and sanitizes it", async () => {
    const folder = mkdtempSync(join(tmpdir(), "source-retention-"));
    vi.stubEnv("AGENTMEMORY_IMPORT_ROOT", folder);
    try {
      const text = `${"message ".repeat(150)}import-tail <private>hidden-import</private>`;
      const path = join(folder, "session.jsonl");
      writeFileSync(path, ["user", "assistant"].map((role) => JSON.stringify({
        type: role, sessionId: "import-source", timestamp: "2026-09-30T00:00:00Z",
        message: { role, content: text },
      })).join("\n"));
      const r = rig();
      expect(await r.call("mem::replay::import-jsonl", { path })).toMatchObject({ success: true, observations: 2 });
      const rows = await r.kv.list(KV.observations("import-source"));
      for (const row of rows) {
        expect(JSON.stringify(row.source)).not.toContain("hidden-import");
        expect(JSON.stringify(row.source).split("import-tail")).toHaveLength(2);
      }
      const replay = await r.call("mem::replay::load", { sessionId: "import-source" });
      expect(replay.timeline.events.map((event: any) => event.kind)).toEqual(["prompt", "response"]);
      expect(replay.timeline.events[1].body).toContain("import-tail");
      expect(replay.timeline.events[1].body).not.toContain("hidden-import");
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });

  it("keeps legacy summaries replayable without claiming their original source was retained", async () => {
    const r = rig();
    const legacy = buildSyntheticCompression(raw({ toolName: "Read", toolInput: { file_path: "config.ts" }, toolOutput: "legacy-summary" }));
    delete legacy.source;
    await r.kv.set(KV.observations(legacy.sessionId), legacy.id, legacy);
    const replay = await r.call("mem::replay::load", { sessionId: legacy.sessionId });
    expect(replay.timeline.events[0].toolOutput).toBe("legacy-summary");
    expect(replay.sourceRetention[0]).toEqual({ observationId: legacy.id, retained: false });
  });
});

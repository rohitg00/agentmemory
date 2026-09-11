import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
  safeAudit: vi.fn(),
}));
vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
  deleteAccessLog: vi.fn(),
}));
vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  isAgentScopeIsolated: () => false,
  isAutoCompressEnabled: () => true,
  getEnvVar: () => undefined,
  isSlotsEnabled: () => false,
}));

import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { registerSearchFunction, getSearchIndex, setIndexPersistence } from "../src/functions/search.js";
import { registerContextFunction } from "../src/functions/context.js";
import { KV, generateId } from "../src/state/schema.js";
import type { MemoryProvider } from "../src/types.js";

const CANARY_A = "quartzfalcon-turbine-threshold-8817";
const CANARY_B = "emeraldotter-inventory-reconcile-4431";

function makeMockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async <T>(
      scope: string,
      key: string,
      updates: Array<{ type: "set"; path: string; value: unknown }>,
    ): Promise<T | null> => {
      const existing = store.get(scope)?.get(key) as Record<string, unknown> | undefined;
      if (!existing) return null;
      for (const u of updates) existing[u.path] = u.value;
      return existing as T;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    store,
  };
}

function makeMockSdk() {
  const functions = new Map<string, Function>();
  const calls: Array<{ id: string; payload: unknown }> = [];
  const voidTriggers: string[] = [];
  return {
    functions,
    calls,
    voidTriggers,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : (idOrInput as { function_id: string }).function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput as { payload: unknown }).payload;
      calls.push({ id, payload });
      const hasVoidAction = (typeof idOrInput === "object" && (idOrInput as any).action !== undefined);
      if (hasVoidAction) {
        voidTriggers.push(id);
        const fn = functions.get(id);
        if (fn) await fn(payload);
        return undefined;
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function providerStub(captured: { compress: string[]; summarize: string[] }): MemoryProvider {
  return {
    name: "test-stub",
    compress: async (_system: string, userPrompt: string) => {
      captured.compress.push(userPrompt);
      const seed = userPrompt.length;
      const id = `obs_stub_${seed.toString(36)}`;
      const canary = userPrompt.includes(CANARY_A) ? CANARY_A : CANARY_B;
      return [
        "<compression>",
        `<type>command_run</type>`,
        `<title>Stub ${id}</title>`,
        `<narrative>${canary}|${userPrompt.slice(0, 120).replace(/[<>|]/g, " ")}</narrative>`,
        `<facts><fact>stub</fact></facts>`,
        `<concepts><concept>canary</concept></concepts>`,
        `<files><file>a.ts</file></files>`,
        "<importance>5</importance>",
        "</compression>",
      ].join("\n");
    },
    summarize: async (_system: string, userPrompt: string) => {
      captured.summarize.push(userPrompt);
      return [
        "<summary>",
        `<title>Session rollup</title>`,
        `<narrative>${CANARY_A} and ${CANARY_B} both appear in prompt</narrative>`,
        "<decisions><decision>none</decision></decisions>",
        "<files><file>a.ts</file></files>",
        "<concepts><concept>canary</concept></concepts>",
        "</summary>",
      ].join("\n");
    },
  } as unknown as MemoryProvider;
}

describe("flash compression lineage — every observation summarized, project isolation intact", () => {
  let sdk: ReturnType<typeof makeMockSdk>;
  let kv: ReturnType<typeof makeMockKV>;
  let captured: { compress: string[]; summarize: string[] };
  let provider: MemoryProvider;

  beforeEach(async () => {
    sdk = makeMockSdk();
    kv = makeMockKV();
    captured = { compress: [], summarize: [] };
    provider = providerStub(captured);
    setIndexPersistence(null);
    getSearchIndex().clear();

    sdk.functions.set("stream::set", async () => ({}));
    sdk.functions.set("stream::send", async () => ({}));
    sdk.functions.set("mem::disk-size-delta", async () => ({}));
    registerObserveFunction(sdk as never, kv as never);
    registerCompressFunction(sdk as never, kv as never, provider as never);
    registerSummarizeFunction(sdk as never, kv as never, provider as never);
    registerSearchFunction(sdk as never, kv as never);
    registerContextFunction(sdk as never, kv as never, 4000);

    // Two sessions in distinct projects, plus one legacy-session project B sharing a display name.
    await kv.set(KV.sessions, "sess-a", {
      id: "sess-a", project: "proj-alpha", cwd: "/srv/alpha", startedAt: "2026-09-10T00:00:00.000Z", status: "active", observationCount: 0,
    });
    await kv.set(KV.sessions, "sess-b", {
      id: "sess-b", project: "proj-beta", cwd: "/srv/beta", startedAt: "2026-09-10T00:00:00.000Z", status: "active", observationCount: 0,
    });
  });

  it("compresses every observation through the LLM stub, keeps summaries in-session, and never crosses projects", async () => {
    // 1. Ingest 3 observations for session A (project alpha) and 2 for session B (project beta).
    const ingestA: string[] = [];
    const ingestB: string[] = [];
    for (let i = 0; i < 3; i++) {
      const obsId = generateId("obs");
      ingestA.push(obsId);
      const res = await sdk.trigger("mem::observe", {
        sessionId: "sess-a",
        hookType: "post_tool_use",
        project: "proj-alpha",
        cwd: "/srv/alpha",
        timestamp: `2026-09-10T01:0${i}:00.000Z`,
        data: { tool_name: "bash", tool_input: `alpha-cmd-${i} marker ${CANARY_A}`, tool_output: `alpha-out-${i}` },
      });
      expect((res as { success?: boolean }).success).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
      const obsId = generateId("obs");
      ingestB.push(obsId);
      const res = await sdk.trigger("mem::observe", {
        sessionId: "sess-b",
        hookType: "post_tool_use",
        project: "proj-beta",
        cwd: "/srv/beta",
        timestamp: `2026-09-10T02:0${i}:00.000Z`,
        data: { tool_name: "bash", tool_input: `beta-cmd-${i} marker ${CANARY_B}`, tool_output: `beta-out-${i}` },
      });
      expect((res as { success?: boolean }).success).toBe(true);
    }

    // 2. The observe path fired mem::compress for every substantive observation (AGENCY: llm path, not synthetic).
    const compressCalls = sdk.calls.filter((c) => c.id === "mem::compress");
    expect(compressCalls.length).toBe(5);

    // 3. Compress consumes the raw content and the stub (flash stand-in) returns summaries stored under the SAME session scope.
    const storedA = await kv.list<Record<string, unknown>>(KV.observations("sess-a"));
    const storedB = await kv.list<Record<string, unknown>>(KV.observations("sess-b"));
    expect(storedA.length).toBe(3);
    expect(storedB.length).toBe(2);
    for (const o of storedA) expect(o.sessionId).toBe("sess-a");
    for (const o of storedB) expect(o.sessionId).toBe("sess-b");

    // 4. Session-level summarize for BOTH sessions: flash must see each session's observations only.
    const sumA = await sdk.trigger("mem::summarize", { sessionId: "sess-a", force: true });
    const sumB = await sdk.trigger("mem::summarize", { sessionId: "sess-b", force: true });
    expect((sumA as { success?: boolean }).success).toBe(true);
    expect((sumB as { success?: boolean }).success).toBe(true);
    expect(captured.summarize.length).toBeGreaterThanOrEqual(2);

    // The A summarize prompt must only contain session-A observations (3) and never session-B's (2).
    // Our compress stub embeds both canaries in every narrative, so instead assert on session IDs and counts.
    const promptsA = captured.summarize.filter((p) => p.includes("(3 total)"));
    const promptsB = captured.summarize.filter((p) => p.includes("(2 total)"));
    expect(promptsA.length).toBeGreaterThanOrEqual(1);
    expect(promptsB.length).toBeGreaterThanOrEqual(1);
    expect(promptsA.length + promptsB.length).toBe(captured.summarize.length);

    // 5. Summaries persisted with correct project stamp.
    const summaryA = await kv.get<Record<string, unknown>>(KV.summaries, "sess-a");
    const summaryB = await kv.get<Record<string, unknown>>(KV.summaries, "sess-b");
    expect(summaryA?.project).toBe("proj-alpha");
    expect(summaryB?.project).toBe("proj-beta");

    // 6. Retrieval isolation: search as alpha finds alpha canary, not beta; search as beta finds beta canary, not alpha.
    const searchA = await sdk.trigger("mem::search", { query: CANARY_A.toLowerCase(), project: "proj-alpha" }) as { results: Array<{ observation: { title?: string; narrative?: string } }> };
    expect(searchA.results.length).toBeGreaterThan(0);
    const searchACross = await sdk.trigger("mem::search", { query: CANARY_B.toLowerCase(), project: "proj-alpha" }) as { results: Array<{ observation: { title?: string; narrative?: string } }> };
    expect(searchACross.results.length).toBe(0);

    const searchB = await sdk.trigger("mem::search", { query: CANARY_B.toLowerCase(), project: "proj-beta" }) as { results: Array<{ observation: { title?: string; narrative?: string } }> };
    expect(searchB.results.length).toBeGreaterThan(0);
    const searchBCross = await sdk.trigger("mem::search", { query: CANARY_A.toLowerCase(), project: "proj-beta" }) as { results: Array<{ observation: { title?: string; narrative?: string } }> };
    expect(searchBCross.results.length).toBe(0);

    // 7. Context injection for alpha never contains beta material (negative assertion on /context seam).
    const ctxA = (await sdk.trigger("mem::context", {
      sessionId: "sess-a",
      project: "proj-alpha",
      project_display_name: "alpha",
    })) as { content?: string };
    const ctxAText = ctxA.content ?? "";
    expect(ctxAText).not.toContain(CANARY_B);
    expect(ctxAText).not.toContain("beta-cmd");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  bootLog: vi.fn(),
}));

import {
  registerSessionBudgetFunctions,
  initBudget,
  recordBudget,
  isBudgetExhausted,
  reapBudgets,
  getBudget,
  initSessionBudgetMeter,
  resetSessionBudgetMeter,
} from "../src/functions/session-budget.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import { withSession, SYSTEM_SESSION } from "../src/state/session-context.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { KV } from "../src/state/schema.js";
import type {
  SessionBudget,
  MemoryProvider,
  RawObservation,
  Session,
  CompressedObservation,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    update: async (
      scope: string,
      key: string,
      ops: Array<{ type: string; path: string; value?: unknown }>,
    ): Promise<unknown> => {
      const cur = (store.get(scope)?.get(key) as Record<string, unknown>) ?? {};
      for (const op of ops) {
        if (op.type === "set") cur[op.path] = op.value;
      }
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, cur);
      return cur;
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggers: Array<{ id: string; payload: unknown }> = [];
  return {
    functions,
    triggers,
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      triggers.push({ id, payload });
      const fn = functions.get(id);
      if (!fn) return undefined; // events/streams not registered in unit ctx
      return fn(payload);
    },
  };
}

function innerProvider(overrides: Partial<MemoryProvider> = {}): MemoryProvider {
  return {
    name: "test-inner",
    compress: vi.fn().mockResolvedValue("<x>ok</x>"),
    summarize: vi.fn().mockResolvedValue("<x>ok</x>"),
    ...overrides,
  };
}

describe("session budget", () => {
  let kv: ReturnType<typeof mockKV>;
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    kv = mockKV();
    sdk = mockSdk();
    delete process.env.AGENTMEMORY_SESSION_TOKEN_CAP;
    delete process.env.AGENTMEMORY_SYSTEM_TOKEN_CAP;
    delete process.env.AGENTMEMORY_SESSION_BUDGET_RETENTION_DAYS;
    delete process.env.SUMMARIZE_CHUNK_SIZE;
    delete process.env.SUMMARIZE_CHUNK_CONCURRENCY;
  });

  afterEach(() => {
    resetSessionBudgetMeter();
    vi.clearAllMocks();
  });

  describe("recordBudget", () => {
    it("forks fresh per session", async () => {
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 50,
        outputTokens: 50,
      });
      const s1 = await getBudget(kv as never, "s1");
      const s2 = await getBudget(kv as never, "s2");
      expect(s1?.tokensUsed).toBe(100);
      expect(s2).toBeNull();
    });

    it("enforces the hard cap", async () => {
      await initBudget(kv as never, { sessionId: "s1", tokenCap: 100 });
      const b = await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 60,
        outputTokens: 50,
      });
      expect(b.tokensUsed).toBe(110);
      expect(b.exhaustedAt).toBeTruthy();
      expect(await isBudgetExhausted(kv as never, "s1")).toBe(true);
    });

    it("emits a soft warning exactly once at 80%", async () => {
      await initBudget(kv as never, { sessionId: "s1", tokenCap: 100 });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 0,
        outputTokens: 85,
      });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 0,
        outputTokens: 5,
      });
      const b = await getBudget(kv as never, "s1");
      expect(b?.warnEmittedAt).toBeTruthy();
      expect(b?.exhaustedAt).toBeFalsy();
      const warnEvents = sdk.triggers.filter(
        (t) => t.id === "event::mem::budget::soft-warned",
      );
      expect(warnEvents).toHaveLength(1);
    });

    it("emits an exhausted event exactly once when crossing the cap", async () => {
      await initBudget(kv as never, { sessionId: "s1", tokenCap: 100 });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 60,
        outputTokens: 50,
      });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 10,
        outputTokens: 0,
      });
      const b = await getBudget(kv as never, "s1");
      expect(b?.exhaustedAt).toBeTruthy();
      const exhaustEvents = sdk.triggers.filter(
        (t) => t.id === "event::mem::budget::exhausted",
      );
      expect(exhaustEvents).toHaveLength(1);
    });

    it("uses AGENTMEMORY_SESSION_TOKEN_CAP when init has no explicit cap", async () => {
      process.env.AGENTMEMORY_SESSION_TOKEN_CAP = "500";
      const budget = await initBudget(kv as never, { sessionId: "s-env" });
      expect(budget.tokenCap).toBe(500);
    });

    it("serializes concurrent increments", async () => {
      await initBudget(kv as never, { sessionId: "s1", tokenCap: 10_000 });
      await Promise.all(
        Array.from({ length: 10 }, () =>
          recordBudget(kv as never, sdk as never, {
            sessionId: "s1",
            inputTokens: 10,
            outputTokens: 0,
          }),
        ),
      );
      const b = await getBudget(kv as never, "s1");
      expect(b?.tokensUsed).toBe(100);
      expect(b?.callCount).toBe(10);
    });

    it("tracks system-triggered calls under the sentinel scope", async () => {
      await recordBudget(kv as never, sdk as never, {
        sessionId: "",
        inputTokens: 10,
        outputTokens: 0,
      });
      const sentinel = await getBudget(kv as never, SYSTEM_SESSION);
      expect(sentinel?.tokensUsed).toBe(10);
      expect(sentinel?.tokenCap).toBe(1_000_000);
    });
  });

  describe("ResilientProvider integration", () => {
    it("blocks LLM calls once the session budget is exhausted", async () => {
      initSessionBudgetMeter(kv as never, sdk as never);
      await initBudget(kv as never, { sessionId: "s1", tokenCap: 10 });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "s1",
        inputTokens: 20,
        outputTokens: 0,
      });
      const inner = innerProvider();
      const provider = new ResilientProvider(inner, "model-x");
      await expect(
        withSession("s1", () => provider.compress("sys", "user")),
      ).rejects.toThrow("session_budget_exhausted");
      expect(inner.compress).not.toHaveBeenCalled();
    });

    it("records nothing for a failed call", async () => {
      initSessionBudgetMeter(kv as never, sdk as never);
      const inner = innerProvider({
        compress: vi.fn().mockRejectedValue(new Error("boom")),
      });
      const provider = new ResilientProvider(inner, "model-x");
      await expect(
        withSession("s2", () => provider.compress("sys", "user")),
      ).rejects.toThrow("boom");
      const b = await getBudget(kv as never, "s2");
      expect(b?.tokensUsed).toBe(0);
      expect(b?.callCount).toBe(1);
    });

    it("records estimated tokens for a successful call", async () => {
      initSessionBudgetMeter(kv as never, sdk as never);
      const inner = innerProvider({
        compress: vi.fn().mockResolvedValue("a".repeat(300)),
      });
      const provider = new ResilientProvider(inner, "model-x");
      await withSession("s3", () => provider.compress("system", "prompt"));
      const b = await getBudget(kv as never, "s3");
      expect(b?.inputTokens).toBeGreaterThan(0);
      expect(b?.outputTokens).toBeGreaterThan(0);
      expect(b?.tokensUsed).toBe((b?.inputTokens ?? 0) + (b?.outputTokens ?? 0));
    });
  });

  describe("reapBudgets", () => {
    it("reaps ended sessions past retention, keeps active and sentinel", async () => {
      const old = new Date(Date.now() - 30 * 86400_000).toISOString();
      await kv.set(KV.sessions, "s_old", {
        id: "s_old",
        endedAt: old,
      } as Session);
      await kv.set(KV.sessions, "s_active", { id: "s_active" } as Session);
      await initBudget(kv as never, { sessionId: "s_old" });
      await initBudget(kv as never, { sessionId: "s_active" });
      await recordBudget(kv as never, sdk as never, {
        sessionId: SYSTEM_SESSION,
        inputTokens: 5,
        outputTokens: 0,
      });
      // Backdate the ended session's budget so the orphan fallback is not
      // what reaps it — the session endedAt is the signal here.
      const result = await reapBudgets(kv as never);
      expect(result.swept).toBe(1);
      expect(await getBudget(kv as never, "s_old")).toBeNull();
      expect(await getBudget(kv as never, "s_active")).not.toBeNull();
      expect(await getBudget(kv as never, SYSTEM_SESSION)).not.toBeNull();
    });
  });

  describe("registered functions", () => {
    beforeEach(() => {
      registerSessionBudgetFunctions(sdk as never, kv as never);
    });

    it("init is idempotent", async () => {
      const first = await sdk.trigger({
        function_id: "mem::session::budget::init",
        payload: { sessionId: "s1", tokenCap: 500 },
      });
      const second = await sdk.trigger({
        function_id: "mem::session::budget::init",
        payload: { sessionId: "s1", tokenCap: 999 },
      });
      expect((first as { budget: SessionBudget }).budget.tokenCap).toBe(500);
      // unchanged: still 500, not reset to 999
      expect((second as { budget: SessionBudget }).budget.tokenCap).toBe(500);
    });

    it("get returns a single budget or the full list", async () => {
      await sdk.trigger({
        function_id: "mem::session::budget::init",
        payload: { sessionId: "s1" },
      });
      const one = (await sdk.trigger({
        function_id: "mem::session::budget::get",
        payload: { sessionId: "s1" },
      })) as { budget: SessionBudget | null };
      expect(one.budget?.sessionId).toBe("s1");
      const all = (await sdk.trigger({
        function_id: "mem::session::budget::get",
        payload: {},
      })) as { budgets: SessionBudget[] };
      expect(all.budgets.length).toBe(1);
    });
  });

  describe("compress synthetic fallback on exhaustion", () => {
    it("stores synthetic compression instead of dropping the observation", async () => {
      initSessionBudgetMeter(kv as never, sdk as never);
      await initBudget(kv as never, { sessionId: "sx", tokenCap: 10 });
      await recordBudget(kv as never, sdk as never, {
        sessionId: "sx",
        inputTokens: 50,
        outputTokens: 0,
      });
      const inner = innerProvider();
      const provider = new ResilientProvider(inner, "model-x");
      registerCompressFunction(sdk as never, kv as never, provider);

      const raw: RawObservation = {
        id: "obs1",
        sessionId: "sx",
        timestamp: new Date().toISOString(),
        hookType: "post_tool_use",
        toolName: "Read",
        toolInput: { file_path: "/tmp/a.ts" },
        toolOutput: "contents",
        raw: {},
      };
      const result = (await sdk.trigger({
        function_id: "mem::compress",
        payload: { observationId: "obs1", sessionId: "sx", raw },
      })) as { success: boolean; budgetExhausted?: boolean };

      expect(result.success).toBe(true);
      expect(result.budgetExhausted).toBe(true);
      expect(inner.compress).not.toHaveBeenCalled();
      const stored = await kv.get<CompressedObservation>(
        KV.observations("sx"),
        "obs1",
      );
      expect(stored?.id).toBe("obs1");
      expect(stored?.title).toBeTruthy();
    });
  });

  describe("summarize truncation on exhaustion", () => {
    it("stops before the next chunk and flags the summary truncated", async () => {
      process.env.SUMMARIZE_CHUNK_SIZE = "1";
      process.env.SUMMARIZE_CHUNK_CONCURRENCY = "1";
      initSessionBudgetMeter(kv as never, sdk as never);
      await initBudget(kv as never, { sessionId: "ss", tokenCap: 10 });

      await kv.set(KV.sessions, "ss", {
        id: "ss",
        project: "proj",
      } as Session);
      for (let i = 0; i < 4; i++) {
        await kv.set(KV.observations("ss"), `o${i}`, {
          id: `o${i}`,
          sessionId: "ss",
          timestamp: new Date().toISOString(),
          type: "file_read",
          title: `obs ${i}`,
          facts: [],
          narrative: "did a thing",
          concepts: ["c"],
          files: ["f.ts"],
          importance: 5,
        } as CompressedObservation);
      }

      const inner = innerProvider({
        summarize: vi
          .fn()
          .mockResolvedValue(
            "<summary><title>Chunk</title><narrative>This chunk summarizes a meaningful slice of the session work.</narrative></summary>",
          ),
      });
      const provider = new ResilientProvider(inner, "model-x");
      registerSummarizeFunction(sdk as never, kv as never, provider);

      const result = (await sdk.trigger({
        function_id: "mem::summarize",
        payload: { sessionId: "ss" },
      })) as { success: boolean; summary?: { truncated?: boolean } };

      expect(result.success).toBe(true);
      expect(result.summary?.truncated).toBe(true);
      // Did not process all four chunks before aborting.
      expect((inner.summarize as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(4);
      const saved = await kv.get<{ truncated?: boolean }>(KV.summaries, "ss");
      expect(saved?.truncated).toBe(true);
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryProvider } from "../src/types.js";
import { registerConsolidateFunction } from "../src/functions/consolidate.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

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
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function makeMockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, payload: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function makeSession(id: string): Session {
  return {
    id,
    project: "agentmemory",
    cwd: "/tmp/agentmemory",
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: 5,
  };
}

function makeObs(id: string, sessionId: string, concept: string): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    type: "decision",
    title: `obs ${id}`,
    facts: ["fact"],
    narrative: "narrative",
    concepts: [concept],
    files: ["src/index.ts"],
    importance: 8,
  };
}

async function seedObservations(
  kv: ReturnType<typeof makeMockKV>,
  sessionId: string,
  concepts: string[],
) {
  for (const concept of concepts) {
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(sessionId),
        `${concept}_${i}`,
        makeObs(`${concept}_${i}`, sessionId, concept),
      );
    }
  }
}

describe("timeout configurability regressions", () => {
  afterEach(() => {
    delete process.env["AGENTMEMORY_CONSOLIDATION_COMPRESS_TIMEOUT_MS"];
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
    delete process.env["OPENAI_TIMEOUT_MS"];
    delete process.env["AGENTMEMORY_INVOCATION_TIMEOUT_MS"];
  });

  it("parsePositiveInt accepts digits only, supports bounds, and rejects malformed values", async () => {
    vi.resetModules();
    const { parsePositiveInt } = await import("../src/config.js");
    expect(parsePositiveInt("600000")).toBe(600000);
    expect(parsePositiveInt("999", { min: 1_000 })).toBeUndefined();
    expect(parsePositiveInt("600001", { max: 600_000 })).toBeUndefined();
    expect(parsePositiveInt("30ms")).toBeUndefined();
    expect(parsePositiveInt("1_000")).toBeUndefined();
    expect(parsePositiveInt(undefined)).toBeUndefined();
  });

  it("resolveTimeoutMs honors precedence and falls back when values are invalid or out of range", async () => {
    vi.resetModules();
    const { resolveTimeoutMs } = await import("../src/config.js");

    expect(resolveTimeoutMs(["1500", "2500"], 60_000, { min: 1_000, max: 10_000 })).toBe(1500);
    expect(resolveTimeoutMs(["999", "2500"], 60_000, { min: 1_000, max: 10_000 })).toBe(2500);
    expect(resolveTimeoutMs(["700000"], 60_000, { min: 1_000, max: 600_000 })).toBe(60_000);
    expect(resolveTimeoutMs(["bad", undefined], 60_000, { min: 1_000, max: 600_000 })).toBe(60_000);
  });

  it("mem::consolidate honors AGENTMEMORY_CONSOLIDATION_COMPRESS_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    process.env["AGENTMEMORY_CONSOLIDATION_COMPRESS_TIMEOUT_MS"] = "1000";

    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider: MemoryProvider = {
      name: "mock",
      compress: vi.fn().mockImplementation(() => new Promise<string>(() => {})),
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
      embedBatch: vi.fn().mockResolvedValue([]),
      dimensions: 384,
      compressionModel: "mock",
    };

    const session = makeSession("sess_timeout");
    await kv.set(KV.sessions, session.id, session);
    await seedObservations(kv, session.id, ["timeouts"]);

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    const pending = sdk.trigger("mem::consolidate", {
      project: "agentmemory",
      minObservations: 1,
    }) as Promise<{ consolidated: number; totalObservations: number }>;

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;

    expect(result.totalObservations).toBe(3);
    expect(result.consolidated).toBe(0);
    expect(provider.compress).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("mem::consolidate counts timed-out attempts toward the LLM budget", async () => {
    vi.useFakeTimers();
    process.env["AGENTMEMORY_CONSOLIDATION_COMPRESS_TIMEOUT_MS"] = "1000";

    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider: MemoryProvider = {
      name: "mock",
      compress: vi.fn().mockImplementation(() => new Promise<string>(() => {})),
      embed: vi.fn().mockResolvedValue(new Float32Array(384)),
      embedBatch: vi.fn().mockResolvedValue([]),
      dimensions: 384,
      compressionModel: "mock",
    };

    const session = makeSession("sess_budget");
    await kv.set(KV.sessions, session.id, session);
    await seedObservations(
      kv,
      session.id,
      Array.from({ length: 12 }, (_, i) => `concept_${i}`),
    );

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    const pending = sdk.trigger("mem::consolidate", {
      project: "agentmemory",
      minObservations: 1,
    }) as Promise<{ consolidated: number; totalObservations: number }>;

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(result.totalObservations).toBe(36);
    expect(result.consolidated).toBe(0);
    expect(provider.compress).toHaveBeenCalledTimes(10);
    vi.useRealTimers();
  });
});

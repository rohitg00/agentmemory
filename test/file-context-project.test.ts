import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(async () => {}),
}));
vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
}));

import { registerEnrichFunction } from "../src/functions/enrich.js";
import { registerFileIndexFunction } from "../src/functions/file-index.js";

function mockKV(listDelayMs = 0) {
  const store = new Map<string, Map<string, unknown>>();
  const stats = { inFlight: 0, maxInFlight: 0, observationLists: 0 };
  return {
    stats,
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
      const isObservations = scope.startsWith("mem:obs:");
      if (isObservations) {
        stats.observationLists++;
        stats.inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
        await new Promise((resolve) => setTimeout(resolve, listDelayMs));
        stats.inFlight--;
      }
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const overrides = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const handler = overrides.get(input.function_id) ?? functions.get(input.function_id);
      if (!handler) throw new Error(`No function registered: ${input.function_id}`);
      return handler(input.payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      overrides.set(id, handler);
    },
  };
}

async function seedSession(
  kv: ReturnType<typeof mockKV>,
  id: string,
  project: string,
  startedAt: string,
) {
  await kv.set("mem:sessions", id, { id, project, startedAt, status: "completed" });
  await kv.set(`mem:obs:${id}`, `obs_${id}`, {
    id: `obs_${id}`,
    sessionId: id,
    type: "file_edit",
    title: `edit in ${project}`,
    narrative: `changed handler in ${project}`,
    files: ["src/handler.ts"],
    importance: 6,
    timestamp: startedAt,
  });
}

describe("mem::enrich and mem::file-context project scoping", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    sdk = mockSdk();
  });

  it("forwards the project from enrich to file-context", async () => {
    const kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);
    let payload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::file-context", async (data: Record<string, unknown>) => {
      payload = data;
      return { context: "" };
    });
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));

    await sdk.trigger({
      function_id: "mem::enrich",
      payload: { sessionId: "ses_now", files: ["src/handler.ts"], project: "alpha" },
    });

    expect(payload).toMatchObject({ sessionId: "ses_now", files: ["src/handler.ts"], project: "alpha" });
  });

  it("returns only the requested project's file history", async () => {
    const kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);
    registerFileIndexFunction(sdk as never, kv as never);
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));
    await seedSession(kv, "ses_alpha", "alpha", "2026-11-01T00:00:00.000Z");
    await seedSession(kv, "ses_beta", "beta", "2026-11-02T00:00:00.000Z");

    const result = (await sdk.trigger({
      function_id: "mem::enrich",
      payload: { sessionId: "ses_now", files: ["src/handler.ts"], project: "alpha" },
    })) as { context: string };

    expect(result.context).toContain("edit in alpha");
    expect(result.context).not.toContain("edit in beta");
  });

  it("loads at most 15 sessions with at most 4 lists in flight", async () => {
    const kv = mockKV(5);
    registerFileIndexFunction(sdk as never, kv as never);
    for (let i = 0; i < 40; i++) {
      await seedSession(kv, `ses_${i}`, "alpha", new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString());
    }

    const result = (await sdk.trigger({
      function_id: "mem::file-context",
      payload: { sessionId: "ses_now", files: ["src/handler.ts"], project: "alpha" },
    })) as { context: string };

    expect(result.context).toContain("edit in alpha");
    expect(kv.stats.observationLists).toBe(15);
    expect(kv.stats.maxInFlight).toBeGreaterThan(1);
    expect(kv.stats.maxInFlight).toBeLessThanOrEqual(4);
  });
});

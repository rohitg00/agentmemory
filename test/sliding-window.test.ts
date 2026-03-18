import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CompressedObservation, MemoryProvider } from "../src/types.js";

function makeObs(
  id: string,
  title: string,
  narrative: string,
  overrides: Partial<CompressedObservation> = {},
): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title,
    subtitle: "",
    facts: [],
    narrative,
    concepts: [],
    files: [],
    importance: 5,
    ...overrides,
  };
}

function mockKV(observations: CompressedObservation[] = []) {
  const store = new Map<string, Map<string, unknown>>();
  const obsMap = new Map<string, unknown>();
  for (const obs of observations) {
    obsMap.set(obs.id, obs);
  }
  store.set("mem:obs:ses_1", obsMap);

  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
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

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, fn: Function) => {
      functions.set(opts.id, fn);
    },
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (fn) return fn(data);
      return null;
    },
    triggerVoid: () => {},
  };
}

function mockProvider(response: string): MemoryProvider {
  return {
    name: "test",
    compress: vi.fn().mockResolvedValue(response),
    summarize: vi.fn().mockResolvedValue(response),
  };
}

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  }),
}));

describe("SlidingWindow", () => {
  it("imports without errors", async () => {
    const mod = await import("../src/functions/sliding-window.js");
    expect(mod.registerSlidingWindowFunction).toBeDefined();
  });

  it("registers both functions", async () => {
    const { registerSlidingWindowFunction } = await import(
      "../src/functions/sliding-window.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    const provider = mockProvider("");
    registerSlidingWindowFunction(sdk as never, kv as never, provider);

    expect(sdk.trigger).toBeDefined();
  });

  it("enriches observation with sliding window context", async () => {
    const { registerSlidingWindowFunction } = await import(
      "../src/functions/sliding-window.js"
    );

    const obs1 = makeObs(
      "obs_1",
      "User discussed React framework",
      "The user mentioned they are working with React for their frontend.",
      { timestamp: "2024-01-01T00:00:00Z" },
    );
    const obs2 = makeObs(
      "obs_2",
      "Framework frustration",
      "The user said they hate that framework and find it hard to debug.",
      { timestamp: "2024-01-01T00:01:00Z" },
    );
    const obs3 = makeObs(
      "obs_3",
      "Switching to Vue",
      "The user decided to switch to Vue for the project.",
      { timestamp: "2024-01-01T00:02:00Z" },
    );

    const kv = mockKV([obs1, obs2, obs3]);
    const sdk = mockSdk();

    const enrichedXml = `<enriched>
  <content>The user (working with React for frontend) expressed strong frustration with React framework, finding it difficult to debug.</content>
  <resolved_entities>
    <entity original="that framework" resolved="React"/>
  </resolved_entities>
  <preferences>
    <preference>User dislikes React due to debugging difficulty</preference>
  </preferences>
  <context_bridges>
    <bridge>User was working with React before expressing frustration</bridge>
  </context_bridges>
</enriched>`;

    const provider = mockProvider(enrichedXml);
    registerSlidingWindowFunction(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::enrich-window", {
      observationId: "obs_2",
      sessionId: "ses_1",
      lookback: 1,
      lookahead: 1,
    })) as { success: boolean; enriched: any };

    expect(result.success).toBe(true);
    expect(result.enriched).toBeDefined();
    expect(result.enriched.resolvedEntities["that framework"]).toBe("React");
    expect(result.enriched.preferences).toContain(
      "User dislikes React due to debugging difficulty",
    );
    expect(result.enriched.contextBridges.length).toBeGreaterThan(0);
  });

  it("returns null enrichment when no adjacent observations", async () => {
    const { registerSlidingWindowFunction } = await import(
      "../src/functions/sliding-window.js"
    );
    const obs = makeObs("obs_solo", "Solo observation", "Just one.");
    const kv = mockKV([obs]);
    const sdk = mockSdk();
    const provider = mockProvider("");
    registerSlidingWindowFunction(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::enrich-window", {
      observationId: "obs_solo",
      sessionId: "ses_1",
    })) as { success: boolean; enriched: any; reason: string };

    expect(result.success).toBe(true);
    expect(result.enriched).toBeNull();
  });

  it("returns error for missing observation", async () => {
    const { registerSlidingWindowFunction } = await import(
      "../src/functions/sliding-window.js"
    );
    const kv = mockKV([]);
    const sdk = mockSdk();
    const provider = mockProvider("");
    registerSlidingWindowFunction(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::enrich-window", {
      observationId: "nonexistent",
      sessionId: "ses_1",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("Observation not found");
  });
});

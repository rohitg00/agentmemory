import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  functions: new Map<string, (data: unknown) => unknown>(),
  store: new Map<string, Map<string, unknown>>(),
  failSessionReads: false,
}));

vi.mock("iii-sdk", () => ({
  sdk: {
    registerFunction: vi.fn(
      (
        idOrOpts: string | { id: string },
        handler: (data: unknown) => unknown,
      ) => {
        const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
        mockState.functions.set(id, handler);
      },
    ),
    registerTrigger: vi.fn(),
    trigger: vi.fn(
      async (
        idOrInput: string | { function_id: string; payload: unknown },
        data?: unknown,
      ) => {
        const id =
          typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
        const payload =
          typeof idOrInput === "string" ? data : idOrInput.payload;
        const fn = mockState.functions.get(id);
        if (!fn) throw new Error(`No function: ${id}`);
        return fn(payload);
      },
    ),
  },
  kv: {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      if (mockState.failSessionReads && scope === "mem:sessions") {
        throw new Error("session store unavailable");
      }
      return (mockState.store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!mockState.store.has(scope)) mockState.store.set(scope, new Map());
      mockState.store.get(scope)!.set(key, data);
      return data;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      mockState.store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      const entries = mockState.store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    }),
  },
}));

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sdk, kv } from "iii-sdk";
import { registerSearchFunction, getSearchIndex, rebuildIndex, setVectorIndex, setEmbeddingProvider, getVectorIndex } from "../src/functions/search.js";
import { sessionAttributionLabel } from "../src/functions/session-attribution.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

describe("mem::search", () => {
  beforeEach(async () => {
    mockState.functions.clear();
    mockState.store.clear();
    mockState.failSessionReads = false;
    vi.clearAllMocks();
    registerSearchFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "demo",
      cwd: "/tmp/demo",
      startedAt: "2026-01-01T00:00:00Z",
      status: "completed",
      observationCount: 2,
      model: "claude-sonnet-4-6",
      agent: {
        client: "claude-code",
        model: "claude-sonnet-4-6",
        agentType: "planner",
        sessionSource: "startup",
      },
      metadata: {
        taskType: "auth-review",
      },
    };
    await kv.set(KV.sessions, session.id, session);

    const obsA: CompressedObservation = {
      id: "obs_a",
      sessionId: "ses_1",
      timestamp: "2026-01-01T00:00:00Z",
      type: "decision",
      title: "Auth middleware decision",
      subtitle: "JWT strategy",
      facts: ["Use rotating refresh tokens"],
      narrative: "Implemented auth middleware with JWT refresh rotation.",
      concepts: ["auth", "jwt"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const obsB: CompressedObservation = {
      id: "obs_b",
      sessionId: "ses_1",
      timestamp: "2026-01-02T00:00:00Z",
      type: "file_edit",
      title: "UI button styling",
      facts: ["Updated primary button color"],
      narrative: "Adjusted button styles in the settings page.",
      concepts: ["ui", "css"],
      files: ["src/ui/button.tsx"],
      importance: 4,
    };

    await kv.set(KV.observations("ses_1"), obsA.id, obsA);
    await kv.set(KV.observations("ses_1"), obsB.id, obsB);

    // Module-level SearchIndex singleton would leak across tests; reset.
    getSearchIndex().clear();
  });

  it("returns full format by default", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth middleware",
    })) as { format: string; results: Array<{ observation: CompressedObservation; session?: { agent?: { client?: string } } }> };

    expect(result.format).toBe("full");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.observation.id).toBe("obs_a");
    expect(result.results[0]?.session?.agent?.client).toBe("claude-code");
  });

  it("returns compact format when requested", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "compact",
    })) as { format: string; results: Array<{ obsId: string; title: string; session?: { model?: string } }> };

    expect(result.format).toBe("compact");
    expect(result.results[0]?.obsId).toBe("obs_a");
    expect(result.results[0]?.title).toBe("Auth middleware decision");
    expect(result.results[0]?.session?.model).toBe("claude-sonnet-4-6");
  });

  it("includes session attribution in narrative output", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth",
      format: "narrative",
    })) as { text: string };

    expect(result.text).toContain("Source: claude-code/planner");
    expect(result.text).toContain("claude-sonnet-4-6");
  });

  it("preserves role-only session attribution", () => {
    const label = sessionAttributionLabel({
      id: "ses_role_only",
      project: "demo",
      startedAt: "2026-01-03T00:00:00Z",
      status: "completed",
      observationCount: 0,
      agent: { role: "reviewer" },
    });

    expect(label).toContain("reviewer");
  });

  it("degrades search attribution when session lookup fails", async () => {
    mockState.failSessionReads = true;

    const result = (await sdk.trigger("mem::search", {
      query: "auth middleware",
    })) as {
      results: Array<{ observation: CompressedObservation; session?: { id: string; label?: string } }>;
    };

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.observation.id).toBe("obs_a");
    expect(result.results[0]?.session).toEqual({ id: "ses_1" });
  });

  it("returns narrative text and respects token budget", async () => {
    const result = (await sdk.trigger("mem::search", {
      query: "auth ui",
      format: "narrative",
      token_budget: 20,
    })) as {
      format: string;
      results: Array<{ obsId: string }>;
      text: string;
      tokens_used: number;
      tokens_budget: number;
      truncated: boolean;
    };

    expect(result.format).toBe("narrative");
    expect(result.tokens_budget).toBe(20);
    expect(result.tokens_used).toBeLessThanOrEqual(20);
    expect(typeof result.text).toBe("string");
    expect(result.results.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
  });

  it("rejects invalid format values", async () => {
    await expect(
      sdk.trigger("mem::search", { query: "auth", format: "verbose" }),
    ).rejects.toThrow("format must be one of");
  });

  it("surfaces saved memories from KV.memories (#265)", async () => {
    // mem::remember persists to KV.memories under a synthetic sessionId
    // ("memory") that has no corresponding KV.observations entry. mem::search
    // must fall back to KV.memories or memory_recall returns empty.
    await kv.set(KV.memories, "mem_x1", {
      id: "mem_x1",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      type: "fact",
      title: "Pineapple belongs on pizza",
      content: "Pineapple belongs on pizza for testing fallback path.",
      concepts: ["pineapple", "pizza"],
      files: [],
      sessionIds: [],
      strength: 7,
      version: 1,
      isLatest: true,
    });
    // Force the rebuild to pick up the new memory (mem::search only
    // rebuilds on first call when idx.size === 0).
    await rebuildIndex(kv as never);

    const result = (await sdk.trigger("mem::search", {
      query: "pineapple pizza",
      format: "compact",
    })) as { results: Array<{ obsId: string; title: string }> };

    const hit = result.results.find((r) => r.obsId === "mem_x1");
    expect(hit).toBeDefined();
    expect(hit?.title).toBe("Pineapple belongs on pizza");
  });

  it("rebuildIndex populates the vector index", async () => {
    const mockEmbedder = {
      name: "test",
      dimensions: 3,
      embed: async (_text: string) => new Float32Array([0.1, 0.2, 0.3]),
      embedBatch: async (_texts: string[]) =>
        _texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
    };
    setEmbeddingProvider(mockEmbedder);
    setVectorIndex(new VectorIndex());

    await rebuildIndex(kv as never);

    const vi = getVectorIndex();
    expect(vi).not.toBeNull();
    expect(vi!.size).toBeGreaterThan(0);

    // Cleanup
    setVectorIndex(null);
    setEmbeddingProvider(null);
  });
});

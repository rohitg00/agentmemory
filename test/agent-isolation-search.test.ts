import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
  deleteAccessLog: vi.fn(),
}));

const configState = {
  agentId: undefined as string | undefined,
  isolated: false,
};

vi.mock("../src/config.js", () => ({
  getAgentId: () => configState.agentId,
  isAgentScopeIsolated: () => configState.isolated,
}));

import {
  registerSearchFunction,
  getSearchIndex,
  setIndexPersistence,
} from "../src/functions/search.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session, SearchResult } from "../src/types.js";

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
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput as { payload: unknown }).payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

async function seedTwoAgents(kv: ReturnType<typeof makeMockKV>) {
  const sessionA: Session = {
    id: "sess-a",
    project: "shared",
    cwd: "/work",
    startTime: "2026-01-01T00:00:00Z",
    type: "code",
  } as Session;
  const sessionB: Session = {
    id: "sess-b",
    project: "shared",
    cwd: "/work",
    startTime: "2026-01-01T00:00:00Z",
    type: "code",
  } as Session;
  await kv.set(KV.sessions, sessionA.id, sessionA);
  await kv.set(KV.sessions, sessionB.id, sessionB);

  const obsA: CompressedObservation = {
    id: "obs-a-secret",
    sessionId: "sess-a",
    timestamp: "2026-01-01T01:00:00Z",
    type: "user_prompt",
    title: "agent A private",
    facts: ["SECRET_MARKER value AAA"],
    narrative: "agent A wrote a secret",
    concepts: ["secret", "private"],
    files: [],
    importance: 8,
    agentId: "agent_a",
  } as CompressedObservation;
  const obsB: CompressedObservation = {
    id: "obs-b-public",
    sessionId: "sess-b",
    timestamp: "2026-01-01T02:00:00Z",
    type: "user_prompt",
    title: "agent B note",
    facts: ["SECRET_MARKER value BBB"],
    narrative: "agent B wrote about the same marker",
    concepts: ["secret"],
    files: [],
    importance: 6,
    agentId: "agent_b",
  } as CompressedObservation;
  await kv.set(KV.observations("sess-a"), obsA.id, obsA);
  await kv.set(KV.observations("sess-b"), obsB.id, obsB);

  // Mirror the indexer's behavior so the BM25 path returns both rows.
  const idx = getSearchIndex();
  idx.add(obsA);
  idx.add(obsB);
}

describe("mem::search agent-scope isolation (#817 follow-up)", () => {
  let sdk: ReturnType<typeof makeMockSdk>;
  let kv: ReturnType<typeof makeMockKV>;

  beforeEach(() => {
    sdk = makeMockSdk();
    kv = makeMockKV();
    setIndexPersistence(null);
    // Reset index between tests.
    const idx = getSearchIndex();
    (idx as unknown as { clear?: () => void }).clear?.();
    configState.agentId = undefined;
    configState.isolated = false;
    registerSearchFunction(sdk as never, kv as never);
  });

  it("isolated mode + env AGENT_ID excludes other agent's observations", async () => {
    configState.isolated = true;
    configState.agentId = "agent_a";
    await seedTwoAgents(kv);

    const result = (await sdk.trigger("mem::search", {
      query: "SECRET_MARKER",
      limit: 10,
    })) as { results: SearchResult[] };
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.observation.agentId).toBe("agent_a");
    }
    expect(result.results.find((r) => r.observation.id === "obs-b-public")).toBeUndefined();
  });

  it('isolated mode + agentId: "*" wildcard bypasses and returns both agents', async () => {
    configState.isolated = true;
    configState.agentId = "agent_a";
    await seedTwoAgents(kv);

    const result = (await sdk.trigger("mem::search", {
      query: "SECRET_MARKER",
      limit: 10,
      agentId: "*",
    })) as { results: SearchResult[] };
    const ids = result.results.map((r) => r.observation.id);
    expect(ids).toContain("obs-a-secret");
    expect(ids).toContain("obs-b-public");
  });

  it("isolated mode with no AGENT_ID fails closed (throws), does not leak", async () => {
    configState.isolated = true;
    configState.agentId = undefined;
    await seedTwoAgents(kv);

    await expect(
      sdk.trigger("mem::search", { query: "SECRET_MARKER", limit: 10 }),
    ).rejects.toThrow(/AGENTMEMORY_AGENT_SCOPE=isolated/);
  });

  it("non-isolated mode (default) returns all rows regardless of agentId", async () => {
    configState.isolated = false;
    configState.agentId = undefined;
    await seedTwoAgents(kv);

    const result = (await sdk.trigger("mem::search", {
      query: "SECRET_MARKER",
      limit: 10,
    })) as { results: SearchResult[] };
    const ids = result.results.map((r) => r.observation.id);
    expect(ids).toContain("obs-a-secret");
    expect(ids).toContain("obs-b-public");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const configState = {
  namespace: "work",
  namespaceIsolated: true,
};

vi.mock("../src/config.js", () => ({
  detectEmbeddingProvider: vi.fn(() => null),
  detectLlmProviderKind: vi.fn(() => "noop"),
  getAgentId: vi.fn(() => undefined),
  getNamespace: vi.fn(() => configState.namespace),
  getStandalonePersistPath: vi.fn(() => "/tmp/standalone.json"),
  isAgentScopeIsolated: vi.fn(() => false),
  isAutoCompressEnabled: vi.fn(() => false),
  isConsolidationEnabled: vi.fn(() => false),
  isContextInjectionEnabled: vi.fn(() => false),
  isGraphExtractionEnabled: vi.fn(() => false),
  isNamespaceScopeIsolated: vi.fn(() => configState.namespaceIsolated),
  isReflectEnabled: vi.fn(() => false),
  isSlotsEnabled: vi.fn(() => false),
}));

vi.mock("../src/health/monitor.js", () => ({
  getLatestHealth: vi.fn(() => null),
}));

vi.mock("../src/viewer/server.js", () => ({
  getBoundViewerPort: vi.fn(() => 3113),
  getViewerSkipped: vi.fn(() => false),
}));

vi.mock("../src/viewer/document.js", () => ({
  renderViewerDocument: vi.fn(() => "<html></html>"),
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type { Memory, Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const current = (store.get(scope)?.get(key) as Record<string, unknown>) ?? {};
      const next = { ...current };
      for (const update of updates) next[update.path] = update.value;
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, next);
      return next;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      (Array.from(store.get(scope)?.values() ?? []) as T[]),
  };
}

function mockSdk() {
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
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

describe("api namespace isolation", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    const sessions: Session[] = [
      {
        id: "sess-work",
        project: "shared",
        namespace: "work",
        cwd: "/repo/work",
        startedAt: "2026-01-01T00:00:00Z",
        status: "active",
        observationCount: 0,
      },
      {
        id: "sess-personal",
        project: "shared",
        namespace: "personal",
        cwd: "/repo/personal",
        startedAt: "2026-01-01T00:00:00Z",
        status: "active",
        observationCount: 0,
      },
    ];
    for (const session of sessions) {
      await kv.set(KV.sessions, session.id, session);
    }

    const memories: Memory[] = [
      {
        id: "mem-work",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        namespace: "work",
        project: "shared",
        type: "fact",
        title: "work memory",
        content: "work memory",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        isLatest: true,
      },
      {
        id: "mem-personal",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        namespace: "personal",
        project: "shared",
        type: "fact",
        title: "personal memory",
        content: "personal memory",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        isLatest: true,
      },
    ];
    for (const memory of memories) {
      await kv.set(KV.memories, memory.id, memory);
    }
  });

  it("session/start stamps the default namespace from config", async () => {
    sdk.registerFunction("mem::context", async () => ({ context: "" }));

    const result = (await sdk.trigger("api::session::start", {
      body: {
        sessionId: "sess-new",
        project: "shared",
        cwd: "/repo/new",
      },
    })) as { body: { session: Session } };

    expect(result.body.session.namespace).toBe("work");
  });

  it("sessions list is filtered by the active namespace in isolated mode", async () => {
    const result = (await sdk.trigger("api::sessions", {
      query_params: {},
    })) as { body: { sessions: Session[] } };

    expect(result.body.sessions).toHaveLength(1);
    expect(result.body.sessions[0]?.namespace).toBe("work");
  });

  it("sessions list supports namespace wildcard override", async () => {
    const result = (await sdk.trigger("api::sessions", {
      query_params: { namespace: "*" },
    })) as { body: { sessions: Session[] } };

    expect(result.body.sessions).toHaveLength(2);
  });

  it("memories list is filtered by the active namespace in isolated mode", async () => {
    const result = (await sdk.trigger("api::memories", {
      query_params: {},
    })) as { body: { memories: Memory[] } };

    expect(result.body.memories).toHaveLength(1);
    expect(result.body.memories[0]?.namespace).toBe("work");
  });
});

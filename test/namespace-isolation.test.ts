import { beforeEach, describe, expect, it, vi } from "vitest";

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
  namespace: "work",
  namespaceIsolated: true,
};

vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  getEnvVar: () => undefined,
  getNamespace: () => configState.namespace,
  isAgentScopeIsolated: () => false,
  isNamespaceScopeIsolated: () => configState.namespaceIsolated,
}));

import { registerContextFunction } from "../src/functions/context.js";
import { registerEnrichFunction } from "../src/functions/enrich.js";
import { registerProfileFunction } from "../src/functions/profile.js";
import {
  getSearchIndex,
  registerSearchFunction,
  setIndexPersistence,
} from "../src/functions/search.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

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
  const triggerOverrides = new Map<string, Function>();
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
      if (triggerOverrides.has(id)) return triggerOverrides.get(id)!(payload);
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
  };
}

describe("namespace isolation", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    setIndexPersistence(null);
    getSearchIndex().clear();

    registerRememberFunction(sdk as never, kv as never);
    registerSearchFunction(sdk as never, kv as never);
    registerEnrichFunction(sdk as never, kv as never);
    registerContextFunction(sdk as never, kv as never, 2000);
    registerProfileFunction(sdk as never, kv as never);

    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));

    const sessions: Session[] = [
      {
        id: "sess-work",
        project: "shared-project",
        namespace: "work",
        cwd: "/repo/work",
        startedAt: "2026-01-01T00:00:00Z",
        status: "active",
        observationCount: 1,
      },
      {
        id: "sess-personal",
        project: "shared-project",
        namespace: "personal",
        cwd: "/repo/personal",
        startedAt: "2026-01-02T00:00:00Z",
        status: "active",
        observationCount: 1,
      },
      {
        id: "sess-work-2",
        project: "shared-project",
        namespace: "work",
        cwd: "/repo/work-2",
        startedAt: "2026-01-03T00:00:00Z",
        status: "active",
        observationCount: 1,
      },
    ];
    for (const session of sessions) {
      await kv.set(KV.sessions, session.id, session);
    }

    const workObs: CompressedObservation = {
      id: "obs-work",
      sessionId: "sess-work",
      timestamp: "2026-01-01T00:00:00Z",
      namespace: "work",
      type: "decision",
      title: "Work auth fix",
      facts: ["Trim JWT header"],
      narrative: "Work namespace fixed auth middleware trimming.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const personalObs: CompressedObservation = {
      id: "obs-personal",
      sessionId: "sess-personal",
      timestamp: "2026-01-02T00:00:00Z",
      namespace: "personal",
      type: "decision",
      title: "Personal auth fix",
      facts: ["Trim local token"],
      narrative: "Personal namespace fixed local auth middleware trimming.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    const workObs2: CompressedObservation = {
      id: "obs-work-2",
      sessionId: "sess-work-2",
      timestamp: "2026-01-03T00:00:00Z",
      namespace: "work",
      type: "decision",
      title: "Work auth fix 2",
      facts: ["Trim JWT header in sibling workspace"],
      narrative: "Work namespace sibling session fixed auth middleware trimming.",
      concepts: ["auth"],
      files: ["src/auth.ts"],
      importance: 8,
    };
    await kv.set(KV.observations("sess-work"), workObs.id, workObs);
    await kv.set(KV.observations("sess-personal"), personalObs.id, personalObs);
    await kv.set(KV.observations("sess-work-2"), workObs2.id, workObs2);
  });

  it("searches only within the active namespace when scope is isolated", async () => {
    await sdk.trigger("mem::remember", {
      content: "Work-only JWT whitespace bug in auth middleware",
      type: "bug",
      files: ["src/auth.ts"],
      project: "shared-project",
      namespace: "work",
    });
    await sdk.trigger("mem::remember", {
      content: "Personal-only JWT whitespace bug in auth middleware",
      type: "bug",
      files: ["src/auth.ts"],
      project: "shared-project",
      namespace: "personal",
    });

    getSearchIndex().clear();

    const result = (await sdk.trigger("mem::search", {
      query: "JWT whitespace auth middleware",
      project: "shared-project",
    })) as { results: Array<{ observation: { narrative: string } }> };

    const combined = result.results.map((r) => r.observation.narrative).join(" ");
    expect(combined).toContain("Work-only");
    expect(combined).not.toContain("Personal-only");
  });

  it("enrich only pulls bug memories from the requested namespace", async () => {
    await sdk.trigger("mem::remember", {
      content: "Work bug: trim Authorization header before validation",
      type: "bug",
      files: ["src/auth.ts"],
      project: "shared-project",
      namespace: "work",
    });
    await sdk.trigger("mem::remember", {
      content: "Personal bug: trim Authorization header before validation",
      type: "bug",
      files: ["src/auth.ts"],
      project: "shared-project",
      namespace: "personal",
    });

    const result = (await sdk.trigger("mem::enrich", {
      sessionId: "sess-work",
      files: ["src/auth.ts"],
      project: "shared-project",
      namespace: "work",
    })) as { context: string };

    expect(result.context).toContain("Work bug");
    expect(result.context).not.toContain("Personal bug");
  });

  it("generates separate profiles for the same project in different namespaces", async () => {
    const work = (await sdk.trigger("mem::profile", {
      project: "shared-project",
      namespace: "work",
    })) as { profile: { sessionCount: number; namespace?: string } };
    const personal = (await sdk.trigger("mem::profile", {
      project: "shared-project",
      namespace: "personal",
    })) as { profile: { sessionCount: number; namespace?: string } };

    expect(work.profile.sessionCount).toBe(2);
    expect(work.profile.namespace).toBe("work");
    expect(personal.profile.sessionCount).toBe(1);
    expect(personal.profile.namespace).toBe("personal");
  });

  it("context for a namespaced project excludes sibling namespaces with the same project id", async () => {
    const result = (await sdk.trigger("mem::context", {
      sessionId: "sess-work",
      project: "shared-project",
      namespace: "work",
      budget: 2000,
    })) as { context: string };

    expect(result.context).toContain("Work auth fix 2");
    expect(result.context).not.toContain("Personal auth fix");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  isAgentScopeIsolated: () => false,
}));

import { resolveProject } from "../src/hooks/_project.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerSearchFunction, getSearchIndex, setIndexPersistence } from "../src/functions/search.js";

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
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function registerMemorySearch() {
  const sdk = makeMockSdk();
  const kv = makeMockKV();
  registerRememberFunction(sdk as never, kv as never);
  registerSearchFunction(sdk as never, kv as never);
  return sdk;
}

describe("worktree project scoping", () => {
  const originalProjectId = process.env.AGENTMEMORY_PROJECT_ID;
  const originalProjectName = process.env.AGENTMEMORY_PROJECT_NAME;
  const linkedWorktreeProject = "git:11111111111111111111111111111111";
  const unrelatedProjectA = "git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const unrelatedProjectB = "git:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_ID;
    delete process.env.AGENTMEMORY_PROJECT_NAME;
    setIndexPersistence(null);
    getSearchIndex().clear();
  });

  afterEach(() => {
    setIndexPersistence(null);
    getSearchIndex().clear();
    if (originalProjectId === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_ID;
    } else {
      process.env.AGENTMEMORY_PROJECT_ID = originalProjectId;
    }
    if (originalProjectName === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalProjectName;
    }
  });

  it("memory written with a canonical linked-worktree project id is recalled from the same id", async () => {
    const sdk = registerMemorySearch();

    await sdk.trigger("mem::remember", {
      content: "linked worktrees must share repository memory scope",
      type: "fact",
      project: linkedWorktreeProject,
    });

    getSearchIndex().clear();

    const result = await sdk.trigger("mem::search", {
      query: "repository memory scope",
      project: linkedWorktreeProject,
    }) as { results: Array<{ observation: { title: string; narrative?: string } }> };

    const combined = result.results
      .map((r) => `${r.observation.title} ${r.observation.narrative ?? ""}`)
      .join(" ");
    expect(combined).toContain("linked worktrees");
  });

  it("same-basename unrelated repositories do not share recall", async () => {
    const sdk = registerMemorySearch();

    await sdk.trigger("mem::remember", {
      content: "repo A has a private architecture decision",
      type: "architecture",
      project: unrelatedProjectA,
    });

    getSearchIndex().clear();

    const result = await sdk.trigger("mem::search", {
      query: "private architecture decision",
      project: unrelatedProjectB,
    }) as { results: Array<{ observation: { title: string; narrative?: string } }> };

    expect(result.results).toHaveLength(0);
  });

  it("keeps historical basename scope separate unless AGENTMEMORY_PROJECT_NAME is set", async () => {
    const historicalProject = "same-name";
    const opaqueProject = linkedWorktreeProject;
    const sdk = registerMemorySearch();

    await sdk.trigger("mem::remember", {
      content: "legacy basename scope keeps release checklist",
      type: "workflow",
      project: historicalProject,
    });

    getSearchIndex().clear();

    const opaqueResult = await sdk.trigger("mem::search", {
      query: "release checklist",
      project: opaqueProject,
    }) as { results: Array<{ observation: { title: string; narrative?: string } }> };
    expect(opaqueResult.results).toHaveLength(0);

    process.env.AGENTMEMORY_PROJECT_NAME = historicalProject;
    const overrideProject = resolveProject("/tmp/same-name");
    expect(overrideProject).toBe(historicalProject);

    const legacyResult = await sdk.trigger("mem::search", {
      query: "release checklist",
      project: overrideProject,
    }) as { results: Array<{ observation: { title: string; narrative?: string } }> };
    const combined = legacyResult.results
      .map((r) => `${r.observation.title} ${r.observation.narrative ?? ""}`)
      .join(" ");
    expect(combined).toContain("legacy basename scope");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  TriggerAction: {
    Void: () => ({ type: "void" }),
  },
}));

vi.mock("../src/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/auth.js", () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual<typeof import("../src/config.js")>("../src/config.js");
  return {
    ...actual,
    detectEmbeddingProvider: vi.fn(() => true),
    detectLlmProviderKind: vi.fn(() => "openai"),
    getAgentId: vi.fn(() => "agent-env"),
    isAgentScopeIsolated: vi.fn(() => false),
    isAutoCompressEnabled: vi.fn(() => true),
    isConsolidationEnabled: vi.fn(() => true),
    isContextInjectionEnabled: vi.fn(() => true),
    isGraphExtractionEnabled: vi.fn(() => true),
  };
});

vi.mock("../src/functions/slots.js", () => ({
  isReflectEnabled: vi.fn(() => true),
  isSlotsEnabled: vi.fn(() => true),
}));

vi.mock("../src/health/monitor.js", () => ({
  getLatestHealth: vi.fn(async () => ({ status: "healthy", checkedAt: "now" })),
}));

vi.mock("../src/viewer/document.js", () => ({
  renderViewerDocument: vi.fn(() => ({
    found: true,
    html: "<!doctype html><html><body>viewer</body></html>",
    csp: "default-src 'self'",
  })),
}));

vi.mock("../src/viewer/server.js", () => ({
  getBoundViewerPort: vi.fn(() => 3112),
  getViewerSkipped: vi.fn(() => false),
}));

import { isConsolidationEnabled } from "../src/config.js";
import { isSlotsEnabled, isReflectEnabled } from "../src/functions/slots.js";
import { getLatestHealth } from "../src/health/monitor.js";
import { renderViewerDocument } from "../src/viewer/document.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type {
  Action,
  CommitLink,
  CompressedObservation,
  Memory,
  Session,
  SessionSummary,
} from "../src/types.js";

type ApiHandler = (request: {
  body?: unknown;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  path_params?: Record<string, string>;
}) => Promise<{ status_code: number; headers?: Record<string, string>; body: unknown }>;

type RegisteredHandler = (payload: unknown) => Promise<unknown>;

function memory(id: string, project = "git:repo", agentId = "agent-env"): Memory {
  return {
    id,
    content: id,
    title: id,
    type: "fact",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 5,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    version: 1,
    isLatest: true,
    project,
    agentId,
  };
}

function session(id: string, agentId = "agent-env"): Session {
  return {
    id,
    project: "git:repo",
    cwd: "/repo",
    startedAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    status: "active",
    observationCount: 1,
    agentId,
  };
}

function action(id: string): Action {
  return {
    id,
    title: id,
    description: id,
    status: "pending",
    priority: 1,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    createdBy: "agent-env",
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
    project: "git:repo",
  };
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    update: vi.fn(async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const current = { ...((store.get(scope)?.get(key) as Record<string, unknown>) ?? {}) };
      for (const update of updates) current[update.path] = update.value;
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, current);
      return current;
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    }),
    seed: (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
    },
  };
}

function mockSdk() {
  const functions = new Map<string, RegisteredHandler>();
  const triggerCalls: Array<{ function_id: string; payload: unknown }> = [];
  const trigger = vi.fn(async (input: { function_id: string; payload: unknown }) => {
    triggerCalls.push({ function_id: input.function_id, payload: input.payload });
    const localHandler = functions.get(input.function_id);
    if (localHandler) return localHandler(input.payload);
    if (input.function_id === "mem::search") return { mode: "full", results: [], payload: input.payload };
    if (input.function_id === "mem::context") return { context: "context", payload: input.payload };
    if (input.function_id === "mem::remember") return { id: "mem_new", payload: input.payload };
    if (input.function_id === "mem::vision-search") return { success: true, payload: input.payload };
    if (input.function_id === "mem::vision-embed") return { success: true, payload: input.payload };
    if (input.function_id === "mem::slot-create") return { success: true, payload: input.payload };
    if (input.function_id === "mem::slot-append") return { success: true, payload: input.payload };
    if (input.function_id === "mem::slot-replace") return { success: true, payload: input.payload };
    if (input.function_id === "mem::slot-delete") return { success: true, payload: input.payload };
    if (input.function_id === "mem::lesson-save") return { action: "created", payload: input.payload };
    if (input.function_id === "mem::graph-extract") return { success: true, nodesAdded: 1, edgesAdded: 1 };
    return { ok: true, function_id: input.function_id, payload: input.payload };
  });
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: RegisteredHandler) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger,
    triggerCalls,
    getFunction: (id: string) => functions.get(id) as ApiHandler | undefined,
  };
}

function req({
  body = {},
  query = {},
  path = {},
  auth = "Bearer secret",
}: {
  body?: unknown;
  query?: Record<string, string>;
  path?: Record<string, string>;
  auth?: string;
} = {}) {
  return {
    body,
    headers: auth ? { authorization: auth } : {},
    query_params: query,
    path_params: path,
  };
}

describe("REST API boundary coverage", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    vi.mocked(isSlotsEnabled).mockReturnValue(true);
    vi.mocked(isReflectEnabled).mockReturnValue(true);
    vi.mocked(renderViewerDocument).mockReturnValue({
      found: true,
      html: "<!doctype html><html><body>viewer</body></html>",
      csp: "default-src 'self'",
    });
    sdk = mockSdk();
    kv = mockKV();
    kv.seed(KV.sessions, "ses_1", session("ses_1"));
    kv.seed(KV.sessions, "ses_other", session("ses_other", "agent-other"));
    kv.seed(KV.summaries, "ses_1", { sessionId: "ses_1", summary: "summary" } satisfies Partial<SessionSummary>);
    kv.seed(KV.observations("ses_1"), "obs_1", {
      id: "obs_1",
      sessionId: "ses_1",
      title: "compressed",
      agentId: "agent-env",
      timestamp: "2026-06-14T00:00:00.000Z",
    } satisfies Partial<CompressedObservation>);
    kv.seed(KV.memories, "mem_1", memory("mem_1"));
    kv.seed(KV.memories, "mem_2", memory("mem_2", "git:other", "agent-other"));
    kv.seed(KV.actions, "act_1", action("act_1"));
    kv.seed(KV.commits, "abcdef123", {
      sha: "abcdef123",
      shortSha: "abcdef1",
      sessionIds: ["ses_1"],
      linkedAt: "2026-06-14T00:00:00.000Z",
      branch: "main",
      repo: "repo",
    } satisfies CommitLink);
    kv.seed(KV.semantic, "sem_1", { id: "sem_1", updatedAt: "2026-06-14T00:00:00.000Z" });
    kv.seed(KV.procedural, "proc_1", { id: "proc_1", updatedAt: "2026-06-14T00:00:00.000Z" });
    kv.seed(KV.relations, "rel_1", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_2",
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    kv.seed(KV.graphNodes, "node_1", {
      id: "node_1",
      type: "concept",
      name: "Agentmemory",
      properties: {},
      sourceObservationIds: [],
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
    });
    kv.seed(KV.graphEdges, "edge_1", {
      id: "edge_1",
      type: "related_to",
      sourceNodeId: "node_1",
      targetNodeId: "node_1",
      weight: 1,
      sourceObservationIds: [],
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    registerApiTriggers(sdk as never, kv as never, "secret", {
      getAll: async () => [{ functionId: "mem::search", count: 1 }],
    } as never, { circuitState: { state: "closed" } });
  });

  it("enforces middleware and direct bearer auth checks", async () => {
    const middleware = sdk.getFunction("middleware::api-auth")!;
    await expect(middleware({ request: { headers: {} } })).resolves.toEqual({
      action: "respond",
      response: { status_code: 401, body: { error: "unauthorized" } },
    });
    await expect(middleware({
      request: { headers: { Authorization: "Bearer secret" } },
    })).resolves.toEqual({ action: "continue" });

    const remember = sdk.getFunction("api::remember")!;
    await expect(remember(req({ body: { content: "x" }, auth: "" }))).resolves.toEqual({
      status_code: 401,
      body: { error: "unauthorized" },
    });
    await expect(remember(req({ body: { content: "x" } }))).resolves.toMatchObject({
      status_code: 201,
    });
  });

  it("denies unauthenticated requests before direct-auth REST handlers reach state or memory functions", async () => {
    const protectedHandlers = [
      "api::config-flags",
      "api::compress-file",
      "api::replay::load",
      "api::replay::sessions",
      "api::replay::import",
      "api::session::by-commit",
      "api::commits",
      "api::sessions",
      "api::observations",
      "api::file-context",
      "api::enrich",
      "api::forget",
      "api::consolidate",
      "api::patterns",
      "api::generate-rules",
      "api::migrate",
      "api::evict",
      "api::smart-search",
      "api::diagnostic-followup",
      "api::timeline",
      "api::profile",
      "api::export",
      "api::import",
      "api::relations",
      "api::evolve",
      "api::auto-forget",
      "api::claude-bridge-read",
      "api::claude-bridge-sync",
      "api::graph-query",
      "api::graph-stats",
      "api::graph-snapshot-rebuild",
      "api::graph-reset",
      "api::graph-extract",
      "api::graph-build",
      "api::consolidate-pipeline",
      "api::team-share",
      "api::team-feed",
      "api::team-profile",
      "api::audit",
      "api::governance-delete",
      "api::governance-bulk",
      "api::snapshots",
      "api::snapshot-create",
      "api::snapshot-restore",
      "api::memories",
      "api::memory-by-id",
      "api::semantic-list",
      "api::procedural-list",
      "api::relations-list",
      "api::vision-search",
      "api::vision-embed",
      "api::slot-list",
      "api::slot-get",
      "api::slot-create",
      "api::slot-append",
      "api::slot-replace",
      "api::slot-delete",
      "api::slot-reflect",
      "api::action-create",
      "api::action-update",
      "api::action-list",
      "api::action-get",
      "api::action-edge",
      "api::frontier",
      "api::next",
      "api::lease-acquire",
      "api::lease-release",
      "api::lease-renew",
      "api::routine-create",
      "api::routine-list",
      "api::routine-run",
      "api::routine-status",
      "api::signal-send",
      "api::signal-read",
      "api::checkpoint-create",
      "api::checkpoint-resolve",
      "api::checkpoint-list",
      "api::mesh-register",
      "api::mesh-list",
      "api::mesh-sync",
      "api::mesh-receive",
      "api::mesh-export",
      "api::flow-compress",
      "api::branch-detect",
      "api::branch-worktrees",
      "api::branch-sessions",
      "api::viewer",
      "api::sentinel-create",
      "api::sentinel-trigger",
      "api::sentinel-check",
      "api::sentinel-cancel",
      "api::sentinel-list",
      "api::sketch-create",
      "api::sketch-add",
      "api::sketch-promote",
      "api::sketch-discard",
      "api::sketch-list",
      "api::sketch-gc",
      "api::crystallize",
      "api::crystal-list",
      "api::auto-crystallize",
      "api::diagnose",
      "api::heal",
      "api::facet-tag",
      "api::facet-untag",
      "api::facet-query",
      "api::facet-get",
      "api::facet-stats",
      "api::verify",
      "api::cascade-update",
      "api::lesson-save",
      "api::lesson-list",
      "api::lesson-search",
      "api::lesson-strengthen",
      "api::obsidian-export",
      "api::reflect",
      "api::insight-list",
      "api::insight-search",
    ];

    const triggerCountBefore = sdk.trigger.mock.calls.length;
    for (const id of protectedHandlers) {
      await expect(sdk.getFunction(id)!(req({ auth: "" })), id).resolves.toEqual({
        status_code: 401,
        body: { error: "unauthorized" },
      });
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(triggerCountBefore);
  });

  it("validates and whitelists first-class REST payloads", async () => {
    const observe = sdk.getFunction("api::observe")!;
    await expect(observe(req({ body: { hookType: "post_tool_use" } }))).resolves.toMatchObject({
      status_code: 400,
    });
    await observe(req({
      body: {
        hookType: "post_tool_use",
        sessionId: "ses_1",
        project: "git:repo",
        cwd: "/repo",
        timestamp: "2026-06-14T00:00:00.000Z",
        data: { tool: "npm" },
        ignored: true,
      },
    }));
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::observe",
      payload: {
        hookType: "post_tool_use",
        sessionId: "ses_1",
        project: "git:repo",
        cwd: "/repo",
        timestamp: "2026-06-14T00:00:00.000Z",
        data: { tool: "npm" },
      },
    });

    const context = sdk.getFunction("api::context")!;
    await expect(context(req({ body: { sessionId: "ses_1", project: "git:repo", budget: 0 } }))).resolves.toMatchObject({
      status_code: 400,
    });
    await context(req({ body: { sessionId: "ses_1", project: "git:repo", budget: "42", ignored: true } }));
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::context",
      payload: { sessionId: "ses_1", project: "git:repo", budget: 42 },
    });

    const search = sdk.getFunction("api::search")!;
    await expect(search(req({ body: { query: "   " } }))).resolves.toMatchObject({ status_code: 400 });
    await expect(search(req({ body: { query: "x", format: "wide" } }))).resolves.toMatchObject({ status_code: 400 });
    await search(req({
      body: {
        query: " auth ",
        limit: 3,
        project: "git:repo",
        cwd: "/repo",
        format: "COMPACT",
        token_budget: 50,
        agentId: "agent-body",
        start_time: "2026-06-01T00:00:00Z",
        end_time: "2026-06-30T23:59:59Z",
        ignored: true,
      },
      query: { agentId: "agent-query" },
    }));
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::search",
      payload: {
        query: "auth",
        limit: 3,
        project: "git:repo",
        cwd: "/repo",
        format: "compact",
        token_budget: 50,
        agentId: "agent-body",
        start_time: "2026-06-01T00:00:00Z",
        end_time: "2026-06-30T23:59:59Z",
      },
    });

    await expect(search(req({
      body: { query: "x", start_time: "not-a-date" },
    }))).resolves.toMatchObject({
      status_code: 400,
      body: { code: "unparseable" },
    });

    const sessions = sdk.getFunction("api::sessions")!;
    await expect(sessions(req({
      query: {
        start_time: "2026-06-14T00:00:00.000Z",
        end_time: "2026-06-14T00:00:00.000Z",
        limit: "1",
      },
    }))).resolves.toMatchObject({
      status_code: 200,
      body: { sessions: [expect.objectContaining({ id: "ses_1" })] },
    });
    await expect(sessions(req({
      query: { end_time: "2026-06-13T23:59:59.000Z" },
    }))).resolves.toMatchObject({
      status_code: 200,
      body: { sessions: [] },
    });
  });

  it("covers core session, commit, replay, and collection handlers", async () => {
    const cases: Array<[string, ReturnType<typeof req>, number]> = [
      ["api::liveness", req(), 200],
      ["api::health", req(), 200],
      ["api::config-flags", req(), 200],
      ["api::compress-file", req({ body: { filePath: "docs/README.md", ignored: true } }), 200],
      ["api::replay::load", req({ query: { sessionId: "ses_1" } }), 200],
      ["api::replay::sessions", req(), 200],
      ["api::replay::import", req({ body: { path: "trace.jsonl", maxFiles: 10, ignored: true } }), 202],
      ["api::session::start", req({ body: { sessionId: "ses_2", project: "git:repo", cwd: "/repo", title: "hello", agentId: "agent-2" } }), 200],
      ["api::session::end", req({ body: { sessionId: "ses_1" } }), 200],
      ["api::summarize", req({ body: { sessionId: "ses_1" } }), 200],
      ["api::session::commit", req({ body: { sha: "fedcba987", sessionId: "ses_1", branch: "main", repo: "repo", files: ["a.ts", 7] } }), 200],
      ["api::session::by-commit", req({ query: { sha: "abcdef123" } }), 200],
      ["api::commits", req({ query: { branch: "main", repo: "repo", limit: "5" } }), 200],
      ["api::sessions", req({ query: { agentId: "*" } }), 200],
      ["api::observations", req({ query: { sessionId: "ses_1", agentId: "*" } }), 200],
      ["api::memories", req({ query: { latest: "true", project: "git:repo", limit: "1", offset: "0" } }), 200],
      ["api::memories", req({ query: { count: "true", agentId: "agent-env", includeOrphans: "true" } }), 200],
      ["api::memory-by-id", req({ path: { id: "mem_1" } }), 200],
      ["api::semantic-list", req(), 200],
      ["api::procedural-list", req(), 200],
      ["api::relations-list", req(), 200],
      ["api::export", req({ query: { maxSessions: "2", offset: "1" } }), 200],
      ["api::import", req({ body: { exportData: { version: "0.9.27" }, strategy: "merge" } }), 200],
    ];

    for (const [id, request, statusCode] of cases) {
      await expect(sdk.getFunction(id)!(request), id).resolves.toMatchObject({
        status_code: statusCode,
      });
    }
  });

  it("covers missing and malformed parameters on representative handlers", async () => {
    const cases: Array<[string, ReturnType<typeof req>, string]> = [
      ["api::compress-file", req(), "filePath"],
      ["api::replay::load", req(), "sessionId"],
      ["api::replay::import", req({ body: { path: "" } }), "path"],
      ["api::session::start", req({ body: { sessionId: "ses" } }), "sessionId, project, and cwd"],
      ["api::session::end", req({ body: { sessionId: "" } }), "sessionId"],
      ["api::summarize", req(), "sessionId"],
      ["api::session::commit", req({ body: { sha: "" } }), "sha"],
      ["api::session::by-commit", req(), "sha"],
      ["api::observations", req(), "sessionId"],
      ["api::memory-by-id", req(), "id path parameter"],
      ["api::import", req(), "exportData"],
      ["api::relations", req({ body: { sourceId: "a" } }), "sourceId"],
      ["api::profile", req(), "project query param"],
    ];

    for (const [id, request, error] of cases) {
      const response = await sdk.getFunction(id)!(request);
      expect(response.status_code, id).toBe(400);
      expect(JSON.stringify(response.body), id).toContain(error);
    }
  });

  it("covers graph, consolidation, team, governance, snapshot, and mesh boundaries", async () => {
    const cases: Array<[string, ReturnType<typeof req>, number]> = [
      ["api::file-context", req({ body: { sessionId: "ses_1", files: ["a.ts"] } }), 200],
      ["api::enrich", req({ body: { sessionId: "ses_1", files: ["a.ts"], terms: ["api"], toolName: "rg", project: "git:repo" } }), 200],
      ["api::remember", req({ body: { content: "remember", type: "fact", concepts: ["api"], files: ["a.ts"], ttlDays: 1, sourceObservationIds: ["obs_1"], project: "git:repo" } }), 201],
      ["api::forget", req({ body: { sessionId: "ses_1", observationIds: ["obs_1"] } }), 200],
      ["api::consolidate", req({ body: { project: "git:repo", minObservations: 1 } }), 200],
      ["api::patterns", req({ body: { project: "git:repo" } }), 200],
      ["api::generate-rules", req({ body: { project: "git:repo" } }), 200],
      ["api::migrate", req({ body: { step: "audit", dryRun: true } }), 200],
      ["api::evict", req({ body: { dryRun: true } }), 200],
      ["api::smart-search", req({ body: { query: "api", expandIds: ["obs_1"], limit: 5, project: "git:repo", includeLessons: true, agentId: "agent-env", sessionId: "ses_1", start_time: "2026-06-01T00:00:00Z", end_time: "2026-06-30T23:59:59Z" } }), 200],
      ["api::diagnostic-followup", req(), 200],
      ["api::timeline", req({ body: { anchor: "2026-06-14", before: 1, after: 1, project: "git:repo" } }), 200],
      ["api::profile", req({ query: { project: "git:repo" } }), 200],
      ["api::relations", req({ body: { sourceId: "mem_1", targetId: "mem_2", type: "related" } }), 201],
      ["api::evolve", req({ body: { memoryId: "mem_1", newContent: "new", newTitle: "title" } }), 200],
      ["api::auto-forget", req({ query: { dryRun: "true" } }), 200],
      ["api::claude-bridge-read", req(), 200],
      ["api::claude-bridge-sync", req(), 200],
      ["api::graph-query", req({ body: { startNodeId: "node_1", nodeType: "concept", maxDepth: 2, query: "api", limit: 5, offset: 0, ignored: true } }), 200],
      ["api::graph-stats", req(), 200],
      ["api::graph-snapshot-rebuild", req(), 200],
      ["api::graph-reset", req(), 200],
      ["api::graph-extract", req({ body: { observations: [{ id: "obs_1" }] } }), 200],
      ["api::graph-build", req({ body: { batchSize: 1 } }), 200],
      ["api::consolidate-pipeline", req({ body: { tier: "all", project: "git:repo", force: true } }), 200],
      ["api::team-share", req({ body: { itemId: "mem_1", itemType: "memory", project: "git:repo" } }), 201],
      ["api::team-feed", req({ query: { limit: "3" } }), 200],
      ["api::team-profile", req(), 200],
      ["api::audit", req({ query: { operation: "memory_save", limit: "3" } }), 200],
      ["api::governance-delete", req({ body: { memoryIds: ["mem_1"], reason: "test" } }), 200],
      ["api::governance-bulk", req({ body: { type: ["fact"], dryRun: true } }), 200],
      ["api::snapshots", req(), 200],
      ["api::snapshot-create", req({ body: { message: "checkpoint" } }), 201],
      ["api::snapshot-restore", req({ body: { commitHash: "abcdef123" } }), 200],
      ["api::mesh-register", req({ body: { url: "https://peer.example", name: "peer", sharedScopes: ["memories"] } }), 201],
      ["api::mesh-list", req(), 200],
      ["api::mesh-sync", req({ body: { peerId: "peer_1", direction: "both" } }), 200],
      ["api::mesh-receive", req({ body: { memories: [] } }), 200],
      ["api::mesh-export", req({ query: { since: "2026-06-13T00:00:00.000Z" } }), 200],
      ["api::flow-compress", req({ body: { runId: "run_1", actionIds: ["act_1"], project: "git:repo" } }), 200],
      ["api::branch-detect", req({ query: { cwd: "/repo" } }), 200],
      ["api::branch-worktrees", req({ query: { cwd: "/repo" } }), 200],
      ["api::branch-sessions", req({ query: { cwd: "/repo" } }), 200],
      ["api::viewer", req(), 200],
    ];

    for (const [id, request, statusCode] of cases) {
      await expect(sdk.getFunction(id)!(request), id).resolves.toMatchObject({
        status_code: statusCode,
      });
    }
    expect(sdk.triggerCalls.find((call) => call.function_id === "mem::graph-query")?.payload).not.toHaveProperty("ignored");
    expect(sdk.triggerCalls.find((call) => call.function_id === "mem::consolidate-pipeline")?.payload).toEqual({
      tier: "all",
      project: "git:repo",
    });
  });

  it("covers optional API feature disabled and error response paths", async () => {
    vi.mocked(isSlotsEnabled).mockReturnValue(false);
    await expect(sdk.getFunction("api::slot-list")!(req())).resolves.toMatchObject({
      status_code: 503,
      body: { flag: "AGENTMEMORY_SLOTS" },
    });
    vi.mocked(isSlotsEnabled).mockReturnValue(true);
    vi.mocked(isReflectEnabled).mockReturnValue(false);
    await expect(sdk.getFunction("api::slot-reflect")!(req({ body: { sessionId: "ses_1" } }))).resolves.toMatchObject({
      status_code: 503,
      body: { flag: "AGENTMEMORY_REFLECT" },
    });
    vi.mocked(isReflectEnabled).mockReturnValue(true);
    vi.mocked(isConsolidationEnabled).mockReturnValue(false);
    await expect(sdk.getFunction("api::auto-crystallize")!(req({ body: { olderThanDays: 1 } }))).resolves.toMatchObject({
      status_code: 503,
      body: { flag: "CONSOLIDATION_ENABLED" },
    });

    const noSecretSdk = mockSdk();
    const noSecretKv = mockKV();
    registerApiTriggers(noSecretSdk as never, noSecretKv as never);
    await expect(noSecretSdk.getFunction("api::mesh-list")!(req())).resolves.toMatchObject({
      status_code: 503,
    });
  });

  it("covers vision, slots, actions, leases, routines, signals, checkpoints, and lessons", async () => {
    const cases: Array<[string, ReturnType<typeof req>, number]> = [
      ["api::vision-search", req({ body: { queryText: "diagram", queryImageRef: "/tmp/a.png", queryImageBase64: "abc", sessionId: "ses_1", topK: "500" } }), 200],
      ["api::vision-embed", req({ body: { imageRef: "/tmp/a.png", sessionId: "ses_1", observationId: "obs_1" } }), 200],
      ["api::slot-list", req(), 200],
      ["api::slot-get", req({ query: { label: "persona" } }), 200],
      ["api::slot-create", req({ body: { label: "persona", content: "c", description: "d", pinned: true, scope: "project", sizeLimit: "100", ignored: true } }), 201],
      ["api::slot-append", req({ body: { label: "persona", text: " more" } }), 200],
      ["api::slot-replace", req({ body: { label: "persona", content: "new" } }), 200],
      ["api::slot-delete", req({ query: { label: "persona" } }), 200],
      ["api::slot-reflect", req({ body: { sessionId: "ses_1", maxObservations: "5" } }), 200],
      ["api::action-create", req({ body: { title: "task", description: "desc", priority: 5, createdBy: "agent", project: "git:repo", tags: ["api"] } }), 201],
      ["api::action-update", req({ body: { actionId: "act_1", status: "done", result: "ok" } }), 200],
      ["api::action-list", req({ query: { status: "pending", project: "git:repo", parentId: "act_parent" } }), 200],
      ["api::action-get", req({ query: { actionId: "act_1" } }), 200],
      ["api::action-edge", req({ body: { sourceActionId: "act_1", targetActionId: "act_2", type: "blocks" } }), 201],
      ["api::frontier", req({ query: { project: "git:repo", agentId: "agent", limit: "10" } }), 200],
      ["api::next", req({ query: { project: "git:repo", agentId: "agent" } }), 200],
      ["api::lease-acquire", req({ body: { actionId: "act_1", agentId: "agent", ttlMs: 1000 } }), 200],
      ["api::lease-release", req({ body: { actionId: "act_1", agentId: "agent", result: "done" } }), 200],
      ["api::lease-renew", req({ body: { actionId: "act_1", agentId: "agent", ttlMs: 1000 } }), 200],
      ["api::routine-create", req({ body: { name: "routine", steps: ["one"] } }), 201],
      ["api::routine-list", req({ query: { frozen: "true" } }), 200],
      ["api::routine-run", req({ body: { routineId: "routine_1", project: "git:repo", initiatedBy: "agent" } }), 201],
      ["api::routine-status", req({ query: { runId: "run_1" } }), 200],
      ["api::signal-send", req({ body: { from: "agent", to: "other", content: "hi", type: "info", replyTo: "sig_0" } }), 201],
      ["api::signal-read", req({ query: { agentId: "agent", unreadOnly: "true", threadId: "thread_1", limit: "3" } }), 200],
      ["api::checkpoint-create", req({ body: { name: "deploy", description: "desc", type: "ci", linkedActionIds: ["act_1"], expiresInMs: 1000 } }), 201],
      ["api::checkpoint-resolve", req({ body: { checkpointId: "chk_1", status: "passed", resolvedBy: "agent", result: { ok: true } } }), 200],
      ["api::checkpoint-list", req({ query: { status: "pending", type: "ci" } }), 200],
      ["api::sentinel-create", req({ body: { name: "timer", type: "timer" } }), 200],
      ["api::sentinel-trigger", req({ body: { sentinelId: "sent_1" } }), 200],
      ["api::sentinel-check", req(), 200],
      ["api::sentinel-cancel", req({ body: { sentinelId: "sent_1" } }), 200],
      ["api::sentinel-list", req({ query: { status: "active", type: "timer" } }), 200],
      ["api::sketch-create", req({ body: { title: "sketch" } }), 200],
      ["api::sketch-add", req({ body: { sketchId: "sk_1", title: "task" } }), 200],
      ["api::sketch-promote", req({ body: { sketchId: "sk_1" } }), 200],
      ["api::sketch-discard", req({ body: { sketchId: "sk_1" } }), 200],
      ["api::sketch-list", req({ query: { status: "active", project: "git:repo" } }), 200],
      ["api::sketch-gc", req(), 200],
      ["api::crystallize", req({ body: { actionIds: ["act_1"] } }), 200],
      ["api::crystal-list", req({ query: { project: "git:repo", sessionId: "ses_1", limit: "5" } }), 200],
      ["api::auto-crystallize", req({ body: { olderThanDays: "1", project: "git:repo", dryRun: true } }), 200],
      ["api::diagnose", req({ body: { categories: "actions" } }), 200],
      ["api::heal", req({ body: { categories: "actions" } }), 200],
      ["api::facet-tag", req({ body: { targetId: "mem_1", targetType: "memory", dimension: "team", value: "backend" } }), 200],
      ["api::facet-untag", req({ body: { targetId: "mem_1", dimension: "team" } }), 200],
      ["api::facet-query", req({ body: { matchAll: "team:backend" } }), 200],
      ["api::facet-get", req({ query: { targetId: "mem_1" } }), 200],
      ["api::facet-stats", req({ query: { targetType: "memory" } }), 200],
      ["api::verify", req({ body: { id: "mem_1" } }), 200],
      ["api::cascade-update", req({ body: { supersededMemoryId: "mem_1" } }), 200],
      ["api::lesson-save", req({ body: { content: "lesson", context: "ctx", confidence: 0.8, project: "git:repo", tags: "a,b" } }), 201],
      ["api::lesson-list", req({ query: { project: "git:repo", source: "manual", minConfidence: "0.5", limit: "10" } }), 200],
      ["api::lesson-search", req({ body: { query: "lesson", project: "git:repo" } }), 200],
      ["api::lesson-strengthen", req({ body: { lessonId: "les_1" } }), 200],
      ["api::obsidian-export", req({ body: { vaultDir: "/tmp/vault", types: "memories,lessons" } }), 200],
      ["api::reflect", req({ body: { project: "git:repo", maxClusters: 2 } }), 200],
      ["api::insight-list", req({ query: { project: "git:repo", minConfidence: "0.5", limit: "5" } }), 200],
      ["api::insight-search", req({ body: { query: "api", project: "git:repo", minConfidence: 0.5, limit: 5 } }), 200],
    ];

    for (const [id, request, statusCode] of cases) {
      await expect(sdk.getFunction(id)!(request), id).resolves.toMatchObject({
        status_code: statusCode,
      });
    }
    expect(sdk.triggerCalls.find((call) => call.function_id === "mem::slot-create")?.payload).toEqual({
      label: "persona",
      content: "c",
      description: "d",
      sizeLimit: 100,
      pinned: true,
      scope: "project",
    });
  });

  it("covers malformed numeric and missing-parameter paths in newer handlers", async () => {
    const cases: Array<[string, ReturnType<typeof req>, string]> = [
      ["api::vision-search", req(), "queryText"],
      ["api::vision-search", req({ body: { queryText: "x", topK: 0 } }), "topK"],
      ["api::vision-embed", req(), "imageRef"],
      ["api::slot-get", req(), "label"],
      ["api::slot-create", req({ body: { label: "x", pinned: "true" } }), "pinned"],
      ["api::slot-create", req({ body: { label: "x", scope: "workspace" } }), "scope"],
      ["api::slot-create", req({ body: { label: "x", sizeLimit: 0 } }), "sizeLimit"],
      ["api::slot-append", req({ body: { label: "x" } }), "label and text"],
      ["api::slot-replace", req({ body: { label: "x" } }), "label and content"],
      ["api::slot-delete", req(), "label"],
      ["api::slot-reflect", req({ body: { sessionId: "ses_1", maxObservations: 0 } }), "maxObservations"],
      ["api::action-create", req(), "title"],
      ["api::action-update", req(), "actionId"],
      ["api::action-get", req(), "actionId"],
      ["api::action-edge", req({ body: { sourceActionId: "a" } }), "sourceActionId"],
      ["api::lease-acquire", req({ body: { actionId: "a" } }), "actionId and agentId"],
      ["api::routine-create", req({ body: { name: "r" } }), "name and steps"],
      ["api::routine-run", req(), "routineId"],
      ["api::routine-status", req(), "runId"],
      ["api::signal-send", req({ body: { from: "agent" } }), "from and content"],
      ["api::signal-read", req(), "agentId"],
      ["api::checkpoint-create", req(), "name"],
      ["api::checkpoint-resolve", req({ body: { checkpointId: "c" } }), "checkpointId and status"],
      ["api::mesh-export", req({ query: { since: "not-a-date" } }), "since"],
      ["api::crystal-list", req({ query: { limit: "0" } }), "limit"],
      ["api::auto-crystallize", req({ body: { olderThanDays: -1 } }), "olderThanDays"],
      ["api::lesson-list", req({ query: { minConfidence: "nope" } }), "minConfidence"],
      ["api::lesson-list", req({ query: { limit: "0" } }), "limit"],
      ["api::obsidian-export", req({ body: { vaultDir: "" } }), "vaultDir"],
      ["api::insight-list", req({ query: { minConfidence: "nope" } }), "minConfidence"],
      ["api::insight-search", req(), "query"],
    ];

    for (const [id, request, error] of cases) {
      const response = await sdk.getFunction(id)!(request);
      expect(response.status_code, id).toBe(400);
      expect(JSON.stringify(response.body), id).toContain(error);
    }
  });

  it("maps downstream disabled and not-found responses to REST status codes", async () => {
    sdk.trigger.mockImplementation(async (input: { function_id: string; payload: unknown }) => {
      sdk.triggerCalls.push(input);
      if (input.function_id === "mem::vision-search") return { success: false, error: "vision disabled" };
      if (input.function_id === "mem::vision-embed") return { success: false, error: "bad image" };
      if (input.function_id === "mem::slot-get") return { success: false, error: "not found" };
      if (input.function_id === "mem::slot-append") return { success: false, error: "would exceed limit" };
      if (input.function_id === "mem::slot-replace") return { success: false, error: "not found" };
      if (input.function_id === "mem::slot-delete") return { success: false, error: "not found" };
      return { success: true };
    });

    await expect(sdk.getFunction("api::vision-search")!(req({ body: { queryText: "x" } }))).resolves.toMatchObject({ status_code: 503 });
    await expect(sdk.getFunction("api::vision-embed")!(req({ body: { imageRef: "/tmp/x" } }))).resolves.toMatchObject({ status_code: 400 });
    await expect(sdk.getFunction("api::slot-get")!(req({ query: { label: "missing" } }))).resolves.toMatchObject({ status_code: 404 });
    await expect(sdk.getFunction("api::slot-append")!(req({ body: { label: "x", text: "y" } }))).resolves.toMatchObject({ status_code: 413 });
    await expect(sdk.getFunction("api::slot-replace")!(req({ body: { label: "x", content: "y" } }))).resolves.toMatchObject({ status_code: 404 });
    await expect(sdk.getFunction("api::slot-delete")!(req({ query: { label: "x" } }))).resolves.toMatchObject({ status_code: 404 });
  });

  it("covers alternate REST response branches and defaulted request fields", async () => {
    vi.mocked(getLatestHealth).mockResolvedValueOnce({ status: "critical" } as never);
    await expect(sdk.getFunction("api::health")!(req())).resolves.toMatchObject({
      status_code: 503,
      body: { status: "critical" },
    });

    vi.mocked(renderViewerDocument).mockReturnValueOnce({
      found: false,
      html: "",
      csp: "",
    });
    await expect(sdk.getFunction("api::viewer")!(req())).resolves.toMatchObject({
      status_code: 404,
      headers: { "Content-Type": "text/html" },
    });

    await expect(sdk.getFunction("api::memory-by-id")!(req({ path: { id: "missing" } }))).resolves.toMatchObject({
      status_code: 404,
    });
    await expect(sdk.getFunction("api::session::by-commit")!(req({ query: { sha: "missing" } }))).resolves.toMatchObject({
      status_code: 404,
    });
    await expect(sdk.getFunction("api::commits")!(req({ query: { limit: "not-a-number" } }))).resolves.toMatchObject({
      status_code: 200,
    });
    await expect(sdk.getFunction("api::team-feed")!(req())).resolves.toMatchObject({
      status_code: 200,
    });
    await expect(sdk.getFunction("api::audit")!(req())).resolves.toMatchObject({
      status_code: 200,
    });
    await expect(sdk.getFunction("api::frontier")!(req())).resolves.toMatchObject({
      status_code: 200,
    });
    await expect(sdk.getFunction("api::routine-list")!(req())).resolves.toMatchObject({
      status_code: 200,
    });
    await expect(sdk.getFunction("api::mesh-export")!(req({ query: { project: "   " } }))).resolves.toMatchObject({
      status_code: 200,
      body: { memories: [], actions: [] },
    });
  });

  it("covers minimal valid payloads where optional fields are intentionally absent", async () => {
    const cases: Array<[string, ReturnType<typeof req>, number]> = [
      ["api::replay::import", req({ body: {} }), 202],
      ["api::session::start", req({ body: { sessionId: "ses_min", project: "git:repo", cwd: "/repo" } }), 200],
      ["api::session::commit", req({ body: { sha: "abc123456" } }), 200],
      ["api::search", req({ body: { query: "minimal" } }), 200],
      ["api::enrich", req({ body: { sessionId: "ses_1", files: ["a.ts"] } }), 200],
      ["api::remember", req({ body: { content: "minimal" } }), 201],
      ["api::migrate", req({ body: { dbPath: "/tmp/state.db" } }), 200],
      ["api::evict", req({ body: {} }), 200],
      ["api::auto-forget", req({ body: {} }), 200],
      ["api::smart-search", req({ body: { expandIds: ["obs_1"] } }), 200],
      ["api::export", req({ query: { maxSessions: "bad", offset: "-1" } }), 200],
      ["api::graph-build", req({ body: { batchSize: "bad" } }), 200],
      ["api::vision-search", req({ body: { queryImageRef: "/tmp/a.png" } }), 200],
      ["api::vision-search", req({ body: { queryImageBase64: "abc" } }), 200],
      ["api::slot-create", req({ body: { label: "minimal" } }), 201],
      ["api::slot-reflect", req({ body: { sessionId: "ses_1" } }), 200],
      ["api::crystal-list", req(), 200],
      ["api::auto-crystallize", req({ body: {} }), 200],
      ["api::lesson-save", req({ body: { content: "minimal", tags: ["array"] } }), 201],
      ["api::lesson-list", req(), 200],
      ["api::reflect", req({ body: {} }), 200],
      ["api::insight-list", req(), 200],
      ["api::insight-search", req({ body: { query: "minimal" } }), 200],
    ];

    for (const [id, request, statusCode] of cases) {
      await expect(sdk.getFunction(id)!(request), id).resolves.toMatchObject({
        status_code: statusCode,
      });
    }
  });

  it("covers provider-backed endpoint catch branches without exposing raw errors", async () => {
    const failingSdk = mockSdk();
    const failingKv = mockKV();
    failingKv.seed(KV.sessions, "ses_1", session("ses_1"));
    failingKv.seed(KV.observations("ses_1"), "obs_1", {
      id: "obs_1",
      title: "compressed",
    });
    registerApiTriggers(failingSdk as never, failingKv as never, "secret");
    failingSdk.trigger.mockImplementation(async (input: { function_id: string; payload: unknown }) => {
      failingSdk.triggerCalls.push(input);
      throw new Error(`disabled: ${input.function_id}`);
    });

    const cases: Array<[string, ReturnType<typeof req>, number, string]> = [
      ["api::claude-bridge-read", req(), 404, "Claude bridge"],
      ["api::claude-bridge-sync", req(), 404, "Claude bridge"],
      ["api::graph-query", req({ body: { query: "x" } }), 503, "GRAPH_EXTRACTION_ENABLED"],
      ["api::graph-stats", req(), 503, "GRAPH_EXTRACTION_ENABLED"],
      ["api::graph-snapshot-rebuild", req(), 503, "GRAPH_EXTRACTION_ENABLED"],
      ["api::graph-reset", req(), 503, "GRAPH_EXTRACTION_ENABLED"],
      ["api::graph-extract", req({ body: { observations: [{ id: "obs_1" }] } }), 503, "GRAPH_EXTRACTION_ENABLED"],
      ["api::consolidate-pipeline", req({ body: { tier: "all" } }), 503, "CONSOLIDATION_ENABLED"],
      ["api::team-share", req({ body: { itemId: "mem_1", itemType: "memory" } }), 404, "Team memory"],
      ["api::team-feed", req(), 404, "Team memory"],
      ["api::team-profile", req(), 404, "Team memory"],
      ["api::snapshots", req(), 404, "Snapshots"],
      ["api::snapshot-create", req({ body: { message: "x" } }), 404, "Snapshots"],
      ["api::snapshot-restore", req({ body: { commitHash: "abc" } }), 404, "Snapshots"],
      ["api::flow-compress", req({ body: {} }), 404, "Flow compression"],
    ];

    for (const [id, request, statusCode, error] of cases) {
      const response = await failingSdk.getFunction(id)!(request);
      expect(response.status_code, id).toBe(statusCode);
      expect(JSON.stringify(response.body), id).toContain(error);
    }

    failingKv.list.mockRejectedValueOnce(new Error("session list failed"));
    await expect(failingSdk.getFunction("api::graph-build")!(req({ body: { batchSize: 1 } }))).resolves.toMatchObject({
      status_code: 503,
      body: { flag: "GRAPH_EXTRACTION_ENABLED" },
    });
  });
});

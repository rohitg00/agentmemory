import { describe, expect, it, vi } from "vitest";

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { KV } from "../src/state/schema.js";

type McpResponse = {
  status_code: number;
  body: unknown;
};

type ApiReq = {
  body?: unknown;
  headers?: Record<string, string>;
  query_params: Record<string, string>;
};

type RegisteredFunction = (req: ApiReq) => Promise<McpResponse>;
type TriggerHandler = (payload: unknown) => unknown | Promise<unknown>;
type TriggerCall = { function_id: string; payload: unknown };

function makeReq(body?: unknown, headers: Record<string, string> = {}): ApiReq {
  return { body, headers, query_params: {} };
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const ensure = (scope: string) => {
    if (!store.has(scope)) store.set(scope, new Map());
    return store.get(scope)!;
  };
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T | undefined) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, value: T): Promise<T> => {
      ensure(scope).set(key, value);
      return value;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    }),
    seed(scope: string, key: string, value: unknown) {
      ensure(scope).set(key, value);
    },
  };
}

function createHarness(secret?: string) {
  const functions = new Map<string, RegisteredFunction>();
  const triggers: unknown[] = [];
  const triggerCalls: TriggerCall[] = [];
  const triggerOverrides = new Map<string, TriggerHandler>();
  const kv = mockKV();
  const sdk = {
    registerFunction: vi.fn((id: string, handler: RegisteredFunction) => {
      functions.set(id, handler);
    }),
    registerTrigger: vi.fn((trigger: unknown) => {
      triggers.push(trigger);
    }),
    trigger: vi.fn(async (input: { function_id: string; payload: unknown }) => {
      triggerCalls.push(input);
      const override = triggerOverrides.get(input.function_id);
      if (override) return override(input.payload);
      return { ok: true, function_id: input.function_id, payload: input.payload };
    }),
  };

  registerMcpEndpoints(sdk as never, kv as never, secret);

  const getFunction = (id: string) => {
    const fn = functions.get(id);
    if (!fn) throw new Error(`missing registered function ${id}`);
    return fn;
  };

  return {
    kv,
    sdk,
    triggers,
    triggerCalls,
    overrideTrigger(id: string, handler: TriggerHandler) {
      triggerOverrides.set(id, handler);
    },
    callTool(name: string, args: Record<string, unknown>, headers?: Record<string, string>) {
      return getFunction("mcp::tools::call")(
        makeReq({ name, arguments: args }, headers),
      );
    },
    listTools(headers?: Record<string, string>) {
      return getFunction("mcp::tools::list")(makeReq(undefined, headers));
    },
    listResources(headers?: Record<string, string>) {
      return getFunction("mcp::resources::list")(makeReq(undefined, headers));
    },
    readResource(uri: string, headers?: Record<string, string>) {
      return getFunction("mcp::resources::read")(makeReq({ uri }, headers));
    },
    listPrompts(headers?: Record<string, string>) {
      return getFunction("mcp::prompts::list")(makeReq(undefined, headers));
    },
    getPrompt(
      name: string,
      args: Record<string, string | number | undefined>,
      headers?: Record<string, string>,
    ) {
      return getFunction("mcp::prompts::get")(
        makeReq({ name, arguments: args }, headers),
      );
    },
    rawCall(body: unknown, headers?: Record<string, string>) {
      return getFunction("mcp::tools::call")(makeReq(body, headers));
    },
  };
}

function contentText(response: McpResponse): string {
  const body = response.body as { content: Array<{ text: string }> };
  return body.content[0].text;
}

function parsedContent(response: McpResponse): unknown {
  return JSON.parse(contentText(response));
}

describe("MCP server registration and auth", () => {
  it("registers tools, resources, and prompts endpoints with stable HTTP routes", () => {
    const h = createHarness();

    expect(h.sdk.registerFunction).toHaveBeenCalledTimes(6);
    expect(h.triggers).toEqual([
      {
        type: "http",
        function_id: "mcp::tools::list",
        config: { api_path: "/agentmemory/mcp/tools", http_method: "GET" },
      },
      {
        type: "http",
        function_id: "mcp::tools::call",
        config: { api_path: "/agentmemory/mcp/call", http_method: "POST" },
      },
      {
        type: "http",
        function_id: "mcp::resources::list",
        config: { api_path: "/agentmemory/mcp/resources", http_method: "GET" },
      },
      {
        type: "http",
        function_id: "mcp::resources::read",
        config: {
          api_path: "/agentmemory/mcp/resources/read",
          http_method: "POST",
        },
      },
      {
        type: "http",
        function_id: "mcp::prompts::list",
        config: { api_path: "/agentmemory/mcp/prompts", http_method: "GET" },
      },
      {
        type: "http",
        function_id: "mcp::prompts::get",
        config: { api_path: "/agentmemory/mcp/prompts/get", http_method: "POST" },
      },
    ]);
  });

  it("enforces bearer auth on every MCP endpoint when a secret is configured", async () => {
    const h = createHarness("secret");

    for (const call of [
      () => h.listTools(),
      () => h.rawCall({ name: "memory_export", arguments: {} }),
      () => h.listResources(),
      () => h.readResource("agentmemory://status"),
      () => h.listPrompts(),
      () => h.getPrompt("detect_patterns", {}),
    ]) {
      await expect(call()).resolves.toMatchObject({
        status_code: 401,
        body: { error: "unauthorized" },
      });
    }

    await expect(
      h.listTools({ authorization: "Bearer secret" }),
    ).resolves.toMatchObject({ status_code: 200 });
  });
});

describe("MCP tools/call validation boundaries", () => {
  it("rejects missing names and unknown tool names without triggering functions", async () => {
    const h = createHarness();

    await expect(h.rawCall({ arguments: {} })).resolves.toMatchObject({
      status_code: 400,
      body: { error: "name is required" },
    });
    await expect(h.callTool("missing_tool", {})).resolves.toMatchObject({
      status_code: 400,
      body: { error: "Unknown tool: missing_tool" },
    });
    expect(h.triggerCalls).toHaveLength(0);
  });

  it.each([
    ["memory_recall", {}, "query is required for memory_recall"],
    [
      "memory_recall",
      { query: "x", format: "xml" },
      "format must be one of: full, compact, narrative",
    ],
    [
      "memory_recall",
      { query: "x", token_budget: 0 },
      "token_budget must be a positive integer",
    ],
    ["memory_compress_file", {}, "filePath is required for memory_compress_file"],
    ["memory_save", {}, "content is required for memory_save"],
    ["memory_file_history", {}, "files is required for memory_file_history"],
    [
      "memory_file_history",
      { files: " , " },
      "files must contain at least one valid path",
    ],
    ["memory_smart_search", {}, "query is required for memory_smart_search"],
    [
      "memory_vision_search",
      {},
      "queryText, queryImageRef, or queryImageBase64 required",
    ],
    ["memory_timeline", {}, "anchor is required for memory_timeline"],
    ["memory_profile", {}, "project is required for memory_profile"],
    ["memory_relations", {}, "memoryId is required for memory_relations"],
    ["memory_team_share", {}, "itemId and itemType are required"],
    ["memory_governance_delete", {}, "memoryIds is required"],
    ["memory_action_create", {}, "title is required"],
    ["memory_action_update", {}, "actionId is required"],
    ["memory_lease", {}, "actionId, agentId, and operation are required"],
    [
      "memory_lease",
      { actionId: "act_1", agentId: "codex", operation: "pause" },
      "operation must be acquire, release, or renew",
    ],
    ["memory_routine_run", {}, "routineId is required"],
    ["memory_signal_send", {}, "from and content are required"],
    ["memory_signal_read", {}, "agentId is required"],
    ["memory_checkpoint", {}, "operation is required"],
    [
      "memory_checkpoint",
      { operation: "resolve" },
      "checkpointId is required for resolve operation",
    ],
    [
      "memory_checkpoint",
      { operation: "delete" },
      "operation must be create, resolve, or list",
    ],
    [
      "memory_sentinel_create",
      { config: "{" },
      "invalid config JSON",
    ],
    [
      "memory_sentinel_trigger",
      { sentinelId: "snl_1", result: "{" },
      "invalid result JSON",
    ],
    [
      "memory_sentinel_trigger",
      {},
      "sentinelId is required for memory_sentinel_trigger",
    ],
    [
      "memory_sketch_create",
      {},
      "title is required for memory_sketch_create",
    ],
    [
      "memory_sketch_promote",
      {},
      "sketchId is required for memory_sketch_promote",
    ],
    ["memory_crystallize", {}, "actionIds is required"],
    ["memory_facet_query", { matchAll: ["bad"] }, "matchAll must be a string"],
    ["memory_facet_query", { matchAny: ["bad"] }, "matchAny must be a string"],
    ["memory_verify", {}, "id is required"],
    ["memory_lesson_save", {}, "content is required"],
    ["memory_lesson_recall", {}, "query is required"],
    ["memory_slot_get", {}, "label required"],
    ["memory_slot_create", {}, "label required"],
    ["memory_slot_append", { label: "notes" }, "label and text required"],
    [
      "memory_slot_replace",
      { label: "notes" },
      "label and content (string) required",
    ],
    ["memory_slot_delete", {}, "label required"],
    ["memory_commit_lookup", {}, "sha required"],
  ])("returns 400 for invalid %s args", async (name, args, error) => {
    const h = createHarness();

    await expect(h.callTool(name, args)).resolves.toMatchObject({
      status_code: 400,
      body: { error },
    });
  });
});

describe("MCP tools/call payload shaping", () => {
  it.each([
    {
      name: "memory_compress_file",
      args: { filePath: " docs/guide.md " },
      function_id: "mem::compress-file",
      payload: { filePath: "docs/guide.md" },
    },
    {
      name: "memory_save",
      args: {
        content: "Use MCP payload whitelists",
        type: "pattern",
        concepts: "mcp, tests, ,coverage",
        files: "src/mcp/server.ts, test/mcp-server-surface.test.ts",
        project: " git:repo ",
      },
      function_id: "mem::remember",
      payload: {
        content: "Use MCP payload whitelists",
        type: "pattern",
        concepts: ["mcp", "tests", "coverage"],
        files: ["src/mcp/server.ts", "test/mcp-server-surface.test.ts"],
        project: "git:repo",
      },
    },
    {
      name: "memory_patterns",
      args: { project: "git:repo" },
      function_id: "mem::patterns",
      payload: { project: "git:repo" },
    },
    {
      name: "memory_smart_search",
      args: { query: "auth", expandIds: [" a ", 42, "b"], limit: 500 },
      function_id: "mem::smart-search",
      payload: { query: "auth", expandIds: ["a", "b"], limit: 100 },
    },
    {
      name: "memory_vision_search",
      args: { queryText: "login form", topK: 100, sessionId: "ses_1" },
      function_id: "mem::vision-search",
      payload: {
        queryText: "login form",
        queryImageRef: undefined,
        queryImageBase64: undefined,
        topK: 50,
        sessionId: "ses_1",
      },
    },
    {
      name: "memory_timeline",
      args: { anchor: "2026-06-14", project: "git:repo", before: 2, after: 3 },
      function_id: "mem::timeline",
      payload: { anchor: "2026-06-14", project: "git:repo", before: 2, after: 3 },
    },
    {
      name: "memory_profile",
      args: { project: "git:repo", refresh: "true" },
      function_id: "mem::profile",
      payload: { project: "git:repo", refresh: true },
    },
    {
      name: "memory_relations",
      args: { memoryId: "mem_1", maxHops: "4", minConfidence: "2" },
      function_id: "mem::get-related",
      payload: { memoryId: "mem_1", maxHops: 4, minConfidence: 1 },
    },
    {
      name: "memory_graph_query",
      args: { startNodeId: " n1 ", nodeType: " concept ", query: " auth ", maxDepth: 99 },
      function_id: "mem::graph-query",
      payload: {
        startNodeId: "n1",
        nodeType: "concept",
        query: "auth",
        maxDepth: 8,
      },
    },
    {
      name: "memory_action_create",
      args: {
        title: "ship tests",
        description: "coverage",
        priority: 9,
        project: "git:repo",
        tags: "coverage, mcp",
        parentId: "act_parent",
        requires: "act_1, act_2",
      },
      function_id: "mem::action-create",
      payload: {
        title: "ship tests",
        description: "coverage",
        priority: 9,
        project: "git:repo",
        tags: ["coverage", "mcp"],
        parentId: "act_parent",
        edges: [
          { type: "requires", targetActionId: "act_1" },
          { type: "requires", targetActionId: "act_2" },
        ],
      },
    },
    {
      name: "memory_sentinel_create",
      args: {
        name: "wait",
        type: "timer",
        config: "{\"timer\":{\"durationMs\":1000}}",
        linkedActionIds: "act_1, act_2",
        expiresInMs: -5,
      },
      function_id: "mem::sentinel-create",
      payload: {
        name: "wait",
        type: "timer",
        config: { timer: { durationMs: 1000 } },
        linkedActionIds: ["act_1", "act_2"],
        expiresInMs: 0,
      },
    },
    {
      name: "memory_facet_query",
      args: { matchAll: "team:backend, status:open", matchAny: "priority:high" },
      function_id: "mem::facet-query",
      payload: {
        matchAll: ["team:backend", "status:open"],
        matchAny: ["priority:high"],
        targetType: undefined,
      },
    },
    {
      name: "memory_obsidian_export",
      args: { types: "memories, lessons", vaultDir: "/tmp/vault" },
      function_id: "mem::obsidian-export",
      payload: { vaultDir: "/tmp/vault", types: ["memories", "lessons"] },
    },
    {
      name: "memory_slot_create",
      args: {
        label: "notes",
        content: "hello",
        description: "Pinned notes",
        sizeLimit: 100,
        pinned: "false",
        scope: "global",
      },
      function_id: "mem::slot-create",
      payload: {
        label: "notes",
        content: "hello",
        description: "Pinned notes",
        sizeLimit: 100,
        pinned: false,
        scope: "global",
      },
    },
  ])("whitelists payload fields for $name", async (c) => {
    const h = createHarness();
    const resultBody = { routed: c.function_id };
    h.overrideTrigger(c.function_id, () => resultBody);

    const response = await h.callTool(c.name, c.args);

    expect(response.status_code).toBe(200);
    expect(parsedContent(response)).toEqual(resultBody);
    expect(h.triggerCalls).toContainEqual({
      function_id: c.function_id,
      payload: c.payload,
    });
  });

  it("formats narrative recall results as direct text and forwards project/agent scope", async () => {
    const h = createHarness();
    h.overrideTrigger("mem::search", () => ({ text: "short narrative" }));

    const response = await h.callTool("memory_recall", {
      query: " auth ",
      format: "narrative",
      token_budget: 400,
      agentId: " codex ",
      project: "git:repo",
      limit: 3,
    });

    expect(response.status_code).toBe(200);
    expect(contentText(response)).toBe("short narrative");
    expect(h.triggerCalls).toEqual([
      {
        function_id: "mem::search",
        payload: {
          query: " auth ",
          limit: 3,
          format: "narrative",
          token_budget: 400,
          agentId: "codex",
          project: "git:repo",
        },
      },
    ]);
  });

  it("returns file history context as plain text while forwarding parsed file lists", async () => {
    const h = createHarness();
    h.overrideTrigger("mem::file-context", () => ({ context: "history text" }));

    const response = await h.callTool("memory_file_history", {
      files: " src/a.ts, ,src/b.ts ",
      sessionId: " ses_1 ",
    });

    expect(response.status_code).toBe(200);
    expect(contentText(response)).toBe("history text");
    expect(h.triggerCalls).toEqual([
      {
        function_id: "mem::file-context",
        payload: { files: ["src/a.ts", "src/b.ts"], sessionId: "ses_1" },
      },
    ]);
  });

  it("routes lease operations to operation-specific functions", async () => {
    const h = createHarness();

    await h.callTool("memory_lease", {
      operation: "acquire",
      actionId: "act_1",
      agentId: "codex",
      ttlMs: 1000,
    });
    await h.callTool("memory_lease", {
      operation: "release",
      actionId: "act_1",
      agentId: "codex",
      result: "done",
    });
    await h.callTool("memory_lease", {
      operation: "renew",
      actionId: "act_1",
      agentId: "codex",
      ttlMs: 2000,
    });

    expect(h.triggerCalls).toEqual([
      {
        function_id: "mem::lease-acquire",
        payload: { actionId: "act_1", agentId: "codex", ttlMs: 1000 },
      },
      {
        function_id: "mem::lease-release",
        payload: { actionId: "act_1", agentId: "codex", result: "done" },
      },
      {
        function_id: "mem::lease-renew",
        payload: { actionId: "act_1", agentId: "codex", ttlMs: 2000 },
      },
    ]);
  });

  it("routes checkpoint operations to create, resolve, and list functions", async () => {
    const h = createHarness();

    await h.callTool("memory_checkpoint", {
      operation: "create",
      name: "review",
      description: "approval",
      type: "approval",
      linkedActionIds: "act_1,act_2",
    });
    await h.callTool("memory_checkpoint", {
      operation: "resolve",
      checkpointId: "chk_1",
      status: "passed",
    });
    await h.callTool("memory_checkpoint", {
      operation: "list",
      type: "approval",
      status: "pending",
    });

    expect(h.triggerCalls).toEqual([
      {
        function_id: "mem::checkpoint-create",
        payload: {
          name: "review",
          description: "approval",
          type: "approval",
          linkedActionIds: ["act_1", "act_2"],
        },
      },
      {
        function_id: "mem::checkpoint-resolve",
        payload: { checkpointId: "chk_1", status: "passed" },
      },
      {
        function_id: "mem::checkpoint-list",
        payload: { status: "pending", type: "approval" },
      },
    ]);
  });
});

describe("MCP tools/call fallback and KV-backed behavior", () => {
  it.each([
    ["memory_claude_bridge_sync", "mem::claude-bridge-read", { direction: "read" }, "Claude bridge not enabled"],
    ["memory_graph_query", "mem::graph-query", { query: "auth" }, "Knowledge graph not enabled"],
    ["memory_consolidate", "mem::consolidate-pipeline", { tier: "semantic" }, "Consolidation not enabled"],
    ["memory_team_share", "mem::team-share", { itemId: "mem_1", itemType: "memory" }, "Team memory not enabled"],
    ["memory_team_feed", "mem::team-feed", {}, "Team memory not enabled"],
    ["memory_audit", "mem::audit-query", {}, "Audit query failed"],
    ["memory_governance_delete", "mem::governance-delete", { memoryIds: "mem_1" }, "Governance delete failed"],
    ["memory_snapshot_create", "mem::snapshot-create", {}, "Snapshots not enabled"],
  ])("returns a user-facing fallback when %s support is disabled", async (name, id, args, text) => {
    const h = createHarness();
    h.overrideTrigger(id, () => {
      throw new Error("disabled");
    });

    const response = await h.callTool(name, args);

    expect(response.status_code).toBe(200);
    expect(contentText(response)).toContain(text);
  });

  it.each([
    ["memory_action_update", "mem::action-update", { actionId: "act_1", status: "done", result: "ok", priority: 3 }],
    ["memory_frontier", "mem::frontier", { project: "git:repo", agentId: "codex", limit: 5 }],
    ["memory_next", "mem::next", { project: "git:repo", agentId: "codex" }],
    ["memory_routine_run", "mem::routine-run", { routineId: "routine_1", project: "git:repo", initiatedBy: "codex" }],
    ["memory_signal_send", "mem::signal-send", { from: "agent-a", to: "agent-b", content: "hi", type: "request", replyTo: "sig_1" }],
    ["memory_signal_read", "mem::signal-read", { agentId: "agent-b", unreadOnly: "true", threadId: "thr_1", limit: 2 }],
    ["memory_mesh_sync", "mem::mesh-sync", { peerId: "peer_1", direction: "both" }],
    ["memory_sentinel_trigger", "mem::sentinel-trigger", { sentinelId: "snl_1", result: "{\"ok\":true}" }],
    ["memory_sketch_create", "mem::sketch-create", { title: "draft", description: "explore", expiresInMs: 5000, project: "git:repo" }],
    ["memory_sketch_promote", "mem::sketch-promote", { sketchId: "sk_1", project: "git:repo" }],
    ["memory_crystallize", "mem::crystallize", { actionIds: "act_1, act_2", project: "git:repo", sessionId: "ses_1" }],
    ["memory_diagnose", "mem::diagnose", { categories: "actions, leases" }],
    ["memory_heal", "mem::heal", { categories: "actions", dryRun: "true" }],
    ["memory_facet_tag", "mem::facet-tag", { targetId: "mem_1", targetType: "memory", dimension: "team", value: "backend" }],
    ["memory_verify", "mem::verify", { id: "mem_1" }],
    ["memory_lesson_save", "mem::lesson-save", { content: "Prefer rg", context: "search", confidence: 0.8, project: "git:repo", tags: "tooling, search" }],
    ["memory_lesson_recall", "mem::lesson-recall", { query: "search", project: "git:repo", minConfidence: 0.2, limit: 3 }],
    ["memory_reflect", "mem::reflect", { project: "git:repo", maxClusters: 2 }],
    ["memory_insight_list", "mem::insight-list", { project: "git:repo", minConfidence: 0.3, limit: 4 }],
    ["memory_slot_list", "mem::slot-list", {}],
    ["memory_slot_get", "mem::slot-get", { label: "notes" }],
    ["memory_slot_append", "mem::slot-append", { label: "notes", text: "more" }],
    ["memory_slot_replace", "mem::slot-replace", { label: "notes", content: "new" }],
    ["memory_slot_delete", "mem::slot-delete", { label: "notes" }],
  ])("calls the expected function for %s", async (name, function_id, args) => {
    const h = createHarness();

    const response = await h.callTool(name, args);

    expect(response.status_code).toBe(200);
    expect(parsedContent(response)).toMatchObject({ function_id });
    expect(h.triggerCalls[0].function_id).toBe(function_id);
  });

  it("returns sessions directly from KV for memory_sessions", async () => {
    const h = createHarness();
    h.kv.seed(KV.sessions, "ses_1", { id: "ses_1" });

    const response = await h.callTool("memory_sessions", {});

    expect(response.status_code).toBe(200);
    expect(parsedContent(response)).toEqual({ sessions: [{ id: "ses_1" }] });
  });

  it("returns commit lookup misses and linked sessions from KV", async () => {
    const h = createHarness();

    await expect(h.callTool("memory_commit_lookup", { sha: "abc" })).resolves.toSatisfy(
      (response: McpResponse) =>
        JSON.stringify(parsedContent(response)) ===
        JSON.stringify({ commit: null, sessions: [] }),
    );

    h.kv.seed(KV.commits, "def", { sha: "def", sessionIds: ["ses_1", "missing"] });
    h.kv.seed(KV.sessions, "ses_1", { id: "ses_1", status: "completed" });
    const response = await h.callTool("memory_commit_lookup", { sha: "def" });

    expect(parsedContent(response)).toEqual({
      commit: { sha: "def", sessionIds: ["ses_1", "missing"] },
      sessions: [{ id: "ses_1", status: "completed" }],
    });
  });

  it("filters, sorts, and limits commit listings from KV", async () => {
    const h = createHarness();
    h.kv.seed(KV.commits, "old", {
      sha: "old",
      branch: "main",
      repo: "origin",
      linkedAt: "2026-01-01T00:00:00Z",
    });
    h.kv.seed(KV.commits, "new", {
      sha: "new",
      branch: "main",
      repo: "origin",
      linkedAt: "2026-02-01T00:00:00Z",
    });
    h.kv.seed(KV.commits, "other", {
      sha: "other",
      branch: "feature",
      repo: "origin",
      linkedAt: "2026-03-01T00:00:00Z",
    });

    const response = await h.callTool("memory_commits", {
      branch: "main",
      repo: "origin",
      limit: 1,
    });

    expect(parsedContent(response)).toEqual({
      commits: [
        {
          sha: "new",
          branch: "main",
          repo: "origin",
          linkedAt: "2026-02-01T00:00:00Z",
        },
      ],
    });
  });
});

describe("MCP resources and prompts boundaries", () => {
  it("rejects invalid resource read inputs and unknown resource URIs", async () => {
    const h = createHarness();

    await expect(h.readResource("")).resolves.toMatchObject({
      status_code: 400,
      body: { error: "uri is required" },
    });
    await expect(
      h.readResource("agentmemory://project/%E0%A4%A/profile"),
    ).resolves.toMatchObject({
      status_code: 400,
      body: { error: "Invalid percent-encoding in URI" },
    });
    await expect(h.readResource("agentmemory://unknown")).resolves.toMatchObject({
      status_code: 404,
      body: { error: "Unknown resource: agentmemory://unknown" },
    });
  });

  it("reads status, latest memories, graph stats, and team profile resources", async () => {
    const h = createHarness();
    h.kv.seed(KV.sessions, "ses_1", { id: "ses_1" });
    h.kv.seed(KV.memories, "mem_1", {
      id: "mem_1",
      title: "Latest",
      type: "fact",
      strength: 8,
      isLatest: true,
      updatedAt: "2026-02-01T00:00:00Z",
    });
    h.kv.seed(KV.memories, "mem_2", {
      id: "mem_2",
      title: "Old",
      type: "bug",
      strength: 2,
      isLatest: false,
      updatedAt: "2026-03-01T00:00:00Z",
    });
    h.kv.seed(KV.graphNodes, "n1", { id: "n1", type: "concept" });
    h.kv.seed(KV.graphEdges, "e1", { id: "e1", type: "mentions" });
    h.kv.seed(KV.teamShared("team 1"), "share_1", { id: "share_1" });

    const status = await h.readResource("agentmemory://status");
    expect(JSON.parse((status.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual({
      sessionCount: 1,
      memoryCount: 2,
      healthStatus: "no-data",
    });

    const latest = await h.readResource("agentmemory://memories/latest");
    expect(JSON.parse((latest.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual([
      { id: "mem_1", title: "Latest", type: "fact", strength: 8 },
    ]);

    const graph = await h.readResource("agentmemory://graph/stats");
    expect(JSON.parse((graph.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual({
      totalNodes: 1,
      totalEdges: 1,
      nodesByType: { concept: 1 },
      edgesByType: { mentions: 1 },
    });

    const team = await h.readResource("agentmemory://team/team%201/profile");
    expect(JSON.parse((team.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual({
      teamId: "team 1",
      sharedItems: 1,
    });
  });

  it("returns project profile and recent summaries with decoded project names", async () => {
    const h = createHarness();
    h.overrideTrigger("mem::profile", (payload) => ({ payload }));
    h.kv.seed(KV.summaries, "ses_old", {
      sessionId: "ses_old",
      project: "repo/main",
      createdAt: "2026-01-01T00:00:00Z",
    });
    h.kv.seed(KV.summaries, "ses_new", {
      sessionId: "ses_new",
      project: "repo/main",
      createdAt: "2026-02-01T00:00:00Z",
    });

    const profile = await h.readResource("agentmemory://project/repo%2Fmain/profile");
    expect(JSON.parse((profile.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual({
      payload: { project: "repo/main" },
    });

    const recent = await h.readResource("agentmemory://project/repo%2Fmain/recent");
    expect(JSON.parse((recent.body as { contents: Array<{ text: string }> }).contents[0].text)).toEqual([
      {
        sessionId: "ses_new",
        project: "repo/main",
        createdAt: "2026-02-01T00:00:00Z",
      },
      {
        sessionId: "ses_old",
        project: "repo/main",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("validates prompt names and argument types", async () => {
    const h = createHarness();

    await expect(h.getPrompt("", {})).resolves.toMatchObject({
      status_code: 400,
      body: { error: "name is required" },
    });
    await expect(h.getPrompt("missing", {})).resolves.toMatchObject({
      status_code: 400,
      body: { error: "Unknown prompt: missing" },
    });
    await expect(
      h.getPrompt("recall_context", { task_description: undefined }),
    ).resolves.toMatchObject({
      status_code: 400,
      body: { error: "task_description argument is required and must be a string" },
    });
    await expect(
      h.getPrompt("session_handoff", { session_id: undefined }),
    ).resolves.toMatchObject({
      status_code: 400,
      body: { error: "session_id argument is required and must be a string" },
    });
    await expect(
      h.getPrompt("detect_patterns", { project: 42 }),
    ).resolves.toMatchObject({
      status_code: 400,
      body: { error: "project argument must be a string" },
    });
  });

  it("builds prompt messages and tolerates search failures in recall_context", async () => {
    const h = createHarness();
    h.overrideTrigger("mem::search", () => {
      throw new Error("search disabled");
    });
    h.overrideTrigger("mem::patterns", (payload) => ({ payload, patterns: [] }));
    h.kv.seed(KV.memories, "mem_1", {
      id: "mem_1",
      title: "Useful",
      content: "Keep MCP tests close",
      isLatest: true,
    });
    h.kv.seed(KV.sessions, "ses_1", { id: "ses_1" });
    h.kv.seed(KV.summaries, "sum_1", {
      sessionId: "ses_1",
      title: "Coverage",
    });

    const recall = await h.getPrompt("recall_context", {
      task_description: "raise coverage",
    });
    expect((recall.body as { messages: Array<{ content: { text: string } }> }).messages[0].content.text).toContain(
      "Keep MCP tests close",
    );

    const handoff = await h.getPrompt("session_handoff", { session_id: "ses_1" });
    expect((handoff.body as { messages: Array<{ content: { text: string } }> }).messages[0].content.text).toContain(
      "Coverage",
    );

    const patterns = await h.getPrompt("detect_patterns", { project: "git:repo" });
    expect((patterns.body as { messages: Array<{ content: { text: string } }> }).messages[0].content.text).toContain(
      "Pattern Analysis",
    );
  });
});

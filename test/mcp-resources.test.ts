import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import type { Session, SessionSummary, Memory } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
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
  const triggerOverrides = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(data);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body?: unknown, headers?: Record<string, string>) {
  return {
    body,
    headers: headers || {},
    query_params: {},
  };
}

describe("MCP Resources", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("lists 4 resources", async () => {
    const fn = sdk.getFunction("mcp::resources::list")!;
    const result = (await fn(makeReq())) as {
      status_code: number;
      body: { resources: unknown[] };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.resources).toHaveLength(4);
  });

  it("reads agentmemory://status", async () => {
    const session: Session = {
      id: "ses_1",
      project: "/test",
      cwd: "/test",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 5,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(makeReq({ uri: "agentmemory://status" }))) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.sessionCount).toBe(1);
  });

  it("reads agentmemory://project/{name}/profile", async () => {
    sdk.overrideTrigger("mem::profile", async () => ({
      project: "/myapp",
      topConcepts: [{ concept: "auth", frequency: 5 }],
    }));

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://project/myapp/profile" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.project).toBe("/myapp");
  });

  it("reads agentmemory://project/{name}/recent with sorted summaries", async () => {
    const summaries: SessionSummary[] = [
      {
        sessionId: "ses_1",
        project: "myapp",
        createdAt: "2026-01-01T00:00:00Z",
        title: "Old session",
        narrative: "old",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 1,
      },
      {
        sessionId: "ses_2",
        project: "myapp",
        createdAt: "2026-02-01T00:00:00Z",
        title: "New session",
        narrative: "new",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 2,
      },
      {
        sessionId: "ses_3",
        project: "other",
        createdAt: "2026-02-15T00:00:00Z",
        title: "Other project",
        narrative: "other",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 3,
      },
    ];
    for (const s of summaries) {
      await kv.set("mem:summaries", s.sessionId, s);
    }

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://project/myapp/recent" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data).toHaveLength(2);
    expect(data[0].sessionId).toBe("ses_2");
  });

  it("reads agentmemory://memories/latest", async () => {
    const memories: Memory[] = [
      {
        id: "mem_1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
        type: "pattern",
        title: "Latest pattern",
        content: "content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 5,
        version: 1,
        isLatest: true,
      },
      {
        id: "mem_2",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-15T00:00:00Z",
        type: "bug",
        title: "Old bug",
        content: "content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 3,
        version: 2,
        isLatest: false,
      },
    ];
    for (const m of memories) {
      await kv.set("mem:memories", m.id, m);
    }

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://memories/latest" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("mem_1");
    expect(data[0].title).toBe("Latest pattern");
  });

  it("returns 404 for unknown URI", async () => {
    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://nonexistent" }),
    )) as { status_code: number };

    expect(result.status_code).toBe(404);
  });

  it("returns 401 when auth fails", async () => {
    const authedSdk = mockSdk();
    const authedKv = mockKV();
    registerMcpEndpoints(authedSdk as never, authedKv as never, "test-secret");

    const fn = authedSdk.getFunction("mcp::resources::list")!;
    const result = (await fn(makeReq())) as { status_code: number };
    expect(result.status_code).toBe(401);

    const authedResult = (await fn(
      makeReq(undefined, { authorization: "Bearer test-secret" }),
    )) as { status_code: number };
    expect(authedResult.status_code).toBe(200);
  });

  it("handles URI with special characters via decodeURIComponent", async () => {
    sdk.overrideTrigger("mem::profile", async (data: any) => ({
      project: data.project,
      topConcepts: [],
    }));

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({
        uri: "agentmemory://project/my%20app%2Fsubdir/profile",
      }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.project).toBe("my app/subdir");
  });
});

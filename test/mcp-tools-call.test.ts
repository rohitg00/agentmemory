import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import type { Session } from "../src/types.js";

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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(payload);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeCall(name: string, args: Record<string, unknown> = {}) {
  return { body: { name, arguments: args }, headers: {}, query_params: {} };
}

function makeSession(id: string, startedAt: string): Session {
  return {
    id,
    project: "demo",
    cwd: "/tmp/demo",
    startedAt,
    status: "completed",
    observationCount: 0,
  };
}

type CallResult = {
  status_code: number;
  body: { content?: Array<{ type: string; text: string }>; isError?: boolean; error?: string };
};

describe("mcp::tools::call dispatch", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const ORIG_SLOTS = process.env["AGENTMEMORY_SLOTS"];

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  afterEach(() => {
    if (ORIG_SLOTS === undefined) delete process.env["AGENTMEMORY_SLOTS"];
    else process.env["AGENTMEMORY_SLOTS"] = ORIG_SLOTS;
  });

  it("slot tools return a structured enableHow error when slots are disabled", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const slotTrigger = vi.fn();
    sdk.overrideTrigger("mem::slot-list", slotTrigger);

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(makeCall("memory_slot_list"))) as CallResult;

    expect(result.status_code).toBe(200);
    expect(result.body.isError).toBe(true);
    const payload = JSON.parse(result.body.content![0]!.text);
    expect(payload.error).toBe("Memory slots not enabled");
    expect(payload.flag).toBe("AGENTMEMORY_SLOTS");
    expect(payload.enableHow).toContain("AGENTMEMORY_SLOTS=true");
    expect(slotTrigger).not.toHaveBeenCalled();
  });

  it("slot tools dispatch to the slot functions when slots are enabled", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "true";
    sdk.overrideTrigger("mem::slot-list", async () => ({ slots: [] }));

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(makeCall("memory_slot_list"))) as CallResult;

    expect(result.status_code).toBe(200);
    expect(result.body.isError).toBeUndefined();
    expect(result.body.content![0]!.text).toContain("slots");
  });

  it("dispatch errors include the underlying message", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "true";
    sdk.overrideTrigger("mem::slot-list", async () => {
      throw new Error("kv exploded");
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(makeCall("memory_slot_list"))) as CallResult;

    expect(result.status_code).toBe(500);
    expect(result.body.error).toContain("Internal error");
    expect(result.body.error).toContain("kv exploded");
  });

  it("memory_save forwards array-typed concepts and files", async () => {
    let captured: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::remember", async (payload: Record<string, unknown>) => {
      captured = payload;
      return { saved: "mem_1" };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(
      makeCall("memory_save", {
        content: "remember this",
        concepts: ["auth", "jwt"],
        files: ["src/auth.ts"],
      }),
    )) as CallResult;

    expect(result.status_code).toBe(200);
    expect(captured?.concepts).toEqual(["auth", "jwt"]);
    expect(captured?.files).toEqual(["src/auth.ts"]);
  });

  it("memory_save still accepts comma-separated string concepts", async () => {
    let captured: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::remember", async (payload: Record<string, unknown>) => {
      captured = payload;
      return { saved: "mem_2" };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    await fn(makeCall("memory_save", { content: "x", concepts: "a, b" }));

    expect(captured?.concepts).toEqual(["a", "b"]);
  });

  it("memory_sessions sorts by startedAt descending and honors limit", async () => {
    await kv.set("mem:sessions", "s1", makeSession("s1", "2026-06-01T00:00:00Z"));
    await kv.set("mem:sessions", "s2", makeSession("s2", "2026-06-03T00:00:00Z"));
    await kv.set("mem:sessions", "s3", makeSession("s3", "2026-06-02T00:00:00Z"));

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(makeCall("memory_sessions", { limit: 2 }))) as CallResult;

    expect(result.status_code).toBe(200);
    const payload = JSON.parse(result.body.content![0]!.text) as { sessions: Session[] };
    expect(payload.sessions.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("memory_sessions clamps limit to an integer from 1 through 100", async () => {
    for (let i = 0; i < 105; i++) {
      const startedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      await kv.set("mem:sessions", `s${i}`, makeSession(`s${i}`, startedAt));
    }

    const fn = sdk.getFunction("mcp::tools::call")!;
    for (const [limit, expected] of [
      [-3, 1],
      [0, 1],
      [2.9, 2],
      [999, 100],
    ] as const) {
      const result = (await fn(makeCall("memory_sessions", { limit }))) as CallResult;
      const payload = JSON.parse(result.body.content![0]!.text) as { sessions: Session[] };
      expect(payload.sessions, `limit=${limit}`).toHaveLength(expected);
    }
  });

  it("memory_sessions defaults to 20 most recent sessions", async () => {
    for (let i = 0; i < 25; i++) {
      const day = String(i + 1).padStart(2, "0");
      await kv.set("mem:sessions", `s${i}`, makeSession(`s${i}`, `2026-05-${day}T00:00:00Z`));
    }

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(makeCall("memory_sessions"))) as CallResult;

    const payload = JSON.parse(result.body.content![0]!.text) as { sessions: Session[] };
    expect(payload.sessions).toHaveLength(20);
    expect(payload.sessions[0]!.id).toBe("s24");
  });
});

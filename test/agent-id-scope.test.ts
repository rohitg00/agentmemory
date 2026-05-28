import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// AGENT_ID scope for multi-agent memory isolation.

describe("loadAgentScope (#554)", () => {
  const ORIG = process.env["AGENT_ID"];
  beforeEach(() => {
    vi.resetModules();
    delete process.env["AGENT_ID"];
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = ORIG;
  });

  it("returns null when AGENT_ID is unset", async () => {
    const { loadAgentScope, getAgentId } = await import("../src/config.js");
    expect(loadAgentScope()).toBeNull();
    expect(getAgentId()).toBeUndefined();
  });

  it("returns the agentId + scope mode when AGENT_ID is set", async () => {
    process.env["AGENT_ID"] = "architect";
    const { loadAgentScope, getAgentId } = await import("../src/config.js");
    expect(loadAgentScope()).toEqual({ agentId: "architect", mode: "shared" });
    expect(getAgentId()).toBe("architect");
  });

  it("trims whitespace and rejects empty after trim", async () => {
    process.env["AGENT_ID"] = "  ";
    const { loadAgentScope } = await import("../src/config.js");
    expect(loadAgentScope()).toBeNull();
  });

  it("caps length at 128 chars to keep KV writes well-formed", async () => {
    process.env["AGENT_ID"] = "x".repeat(500);
    const { getAgentId } = await import("../src/config.js");
    expect(getAgentId()!.length).toBe(128);
  });
});

describe("mem::remember stamps agentId on the Memory (#554)", () => {
  const ORIG = process.env["AGENT_ID"];
  beforeEach(() => {
    vi.resetModules();
    delete process.env["AGENT_ID"];
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = ORIG;
  });

  function mockKV() {
    const store = new Map<string, Map<string, unknown>>();
    return {
      store,
      get: async <T>(scope: string, key: string): Promise<T | null> =>
        (store.get(scope)?.get(key) as T) ?? null,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, data);
        return data;
      },
      delete: async (scope: string, key: string) => {
        store.get(scope)?.delete(key);
      },
      list: async <T>(scope: string): Promise<T[]> => {
        const m = store.get(scope);
        return m ? (Array.from(m.values()) as T[]) : [];
      },
    };
  }

  function mockSdk() {
    const fns = new Map<string, Function>();
    return {
      fns,
      registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
        const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
        fns.set(id, fn);
      },
      trigger: async (
        idOrInput: string | { function_id: string; payload: unknown },
        data?: unknown,
      ) => {
        const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
        const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
        const fn = fns.get(id);
        if (fn) return fn(payload);
        return null;
      },
    };
  }

  it("stamps env AGENT_ID on Memory when no body override", async () => {
    process.env["AGENT_ID"] = "developer";
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "prefer async-std over tokio",
      type: "preference",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBe("developer");
  });

  it("body agentId overrides env AGENT_ID", async () => {
    process.env["AGENT_ID"] = "architect";
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "use http-cache for github API",
      agentId: "reviewer",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBe("reviewer");
  });

  it("no env, no body → no agentId on Memory (legacy)", async () => {
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "legacy unscoped memory",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBeUndefined();
  });

  it("body agentId is trimmed of leading/trailing whitespace", async () => {
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "trim me",
      agentId: "  architect  ",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBe("architect");
  });

  it("body agentId longer than 128 chars is truncated to 128", async () => {
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const long = "x".repeat(500);
    const result = (await sdk.trigger("mem::remember", {
      content: "cap length",
      agentId: long,
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBeDefined();
    expect(result.memory.agentId!.length).toBe(128);
    expect(result.memory.agentId).toBe("x".repeat(128));
  });

  it("whitespace-only body agentId falls back to env AGENT_ID", async () => {
    process.env["AGENT_ID"] = "developer";
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "fall through to env",
      agentId: "   ",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBe("developer");
  });

  it("empty-string body agentId with no env → no agentId stamped", async () => {
    const { registerRememberFunction } = await import(
      "../src/functions/remember.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "no env no usable body",
      agentId: "",
    })) as { memory: { id: string; agentId?: string } };

    expect(result.memory.agentId).toBeUndefined();
  });
});

describe("AGENTMEMORY_AGENT_SCOPE mode (#554)", () => {
  const ORIG_ID = process.env["AGENT_ID"];
  const ORIG_MODE = process.env["AGENTMEMORY_AGENT_SCOPE"];
  beforeEach(() => {
    vi.resetModules();
    delete process.env["AGENT_ID"];
    delete process.env["AGENTMEMORY_AGENT_SCOPE"];
  });
  afterEach(() => {
    if (ORIG_ID === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = ORIG_ID;
    if (ORIG_MODE === undefined) delete process.env["AGENTMEMORY_AGENT_SCOPE"];
    else process.env["AGENTMEMORY_AGENT_SCOPE"] = ORIG_MODE;
  });

  it("defaults to shared mode when AGENT_ID set but scope unset", async () => {
    process.env["AGENT_ID"] = "developer";
    const { loadAgentScope, isAgentScopeIsolated } = await import(
      "../src/config.js"
    );
    expect(loadAgentScope()).toEqual({
      agentId: "developer",
      mode: "shared",
    });
    expect(isAgentScopeIsolated()).toBe(false);
  });

  it("flips to isolated when AGENTMEMORY_AGENT_SCOPE=isolated", async () => {
    process.env["AGENT_ID"] = "developer";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
    const { loadAgentScope, isAgentScopeIsolated } = await import(
      "../src/config.js"
    );
    expect(loadAgentScope()).toEqual({
      agentId: "developer",
      mode: "isolated",
    });
    expect(isAgentScopeIsolated()).toBe(true);
  });

  it("isolated requires AGENT_ID to also be set (no scope without id)", async () => {
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
    const { isAgentScopeIsolated } = await import("../src/config.js");
    expect(isAgentScopeIsolated()).toBe(false);
  });

  it("unknown scope values fall back to shared", async () => {
    process.env["AGENT_ID"] = "developer";
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "weird";
    const { isAgentScopeIsolated } = await import("../src/config.js");
    expect(isAgentScopeIsolated()).toBe(false);
  });
});

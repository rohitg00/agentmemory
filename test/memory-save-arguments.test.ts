import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { handleToolCall } from "../src/mcp/standalone.js";
import { resetHandleForTests } from "../src/mcp/rest-proxy.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { normalizeRememberFields, rememberFieldsError, TTL_TOO_LARGE, ttlExpiry } from "../src/mcp/remember-arguments.js";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { mockKV, mockSdk as rememberSdk } from "./helpers/mocks.js";

type Payload = Record<string, unknown>;
type Response = { status_code: number; body: Record<string, unknown> };

function captureSdk() {
  const functions = new Map<string, (req: unknown) => Promise<Response>>();
  const payloads: Payload[] = [];
  return {
    registerFunction: (id: string | { id: string }, handler: (req: unknown) => Promise<Response>) => {
      functions.set(typeof id === "string" ? id : id.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: Payload }) => {
      if (input.function_id === "mem::remember") payloads.push(input.payload);
      return { success: true };
    },
    payloads,
    fn: (id: string) => functions.get(id)!,
  };
}

const kvStub = {
  get: async () => null,
  set: async (_s: string, _k: string, d: unknown) => d,
  delete: async () => {},
  list: async () => [],
};

async function viaMcpServer(args: Payload): Promise<Payload> {
  const sdk = captureSdk();
  registerMcpEndpoints(sdk as never, kvStub as never);
  const res = await sdk.fn("mcp::tools::call")({ headers: {}, body: { name: "memory_save", arguments: args } });
  expect(res.status_code).toBe(200);
  return sdk.payloads[0]!;
}

async function viaRest(body: Payload): Promise<Payload> {
  const sdk = captureSdk();
  registerApiTriggers(sdk as never, kvStub as never);
  const res = await sdk.fn("api::remember")({
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  expect(res.status_code).toBe(201);
  return sdk.payloads[0]!;
}

async function viaStandalone(args: Payload): Promise<Payload> {
  let sent: Payload | undefined;
  globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = url.toString();
    if (href.endsWith("/agentmemory/livez")) return new Response("ok", { status: 200 });
    if (href.endsWith("/agentmemory/remember")) {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  await handleToolCall("memory_save", args);
  expect(sent).toBeDefined();
  return viaRest(sent!);
}

describe("normalizeRememberFields", () => {
  it("accepts comma-separated strings and string arrays alike", () => {
    expect(normalizeRememberFields({ concepts: "auth, jwt ,", files: ["src/a.ts", " ", 3] })).toEqual({
      concepts: ["auth", "jwt"],
      files: ["src/a.ts"],
    });
    expect(normalizeRememberFields({ concepts: ["auth", " jwt "] }).concepts).toEqual(["auth", "jwt"]);
  });

  it("keeps a positive ttlDays and drops invalid values", () => {
    expect(normalizeRememberFields({ ttlDays: 7 }).ttlDays).toBe(7);
    expect(normalizeRememberFields({ ttlDays: "14" }).ttlDays).toBe(14);
    for (const ttlDays of [0, -1, "abc", "", Number.NaN, null]) {
      expect(normalizeRememberFields({ ttlDays })).not.toHaveProperty("ttlDays");
    }
  });

  it("keeps non-empty source observation ids only", () => {
    expect(normalizeRememberFields({ sourceObservationIds: ["obs_1", "", 5] }).sourceObservationIds).toEqual(["obs_1"]);
    expect(normalizeRememberFields({ sourceObservationIds: "obs_1" })).not.toHaveProperty("sourceObservationIds");
  });
});

describe("memory_save arguments across surfaces", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetHandleForTests();
    process.env["AGENTMEMORY_URL"] = "http://localhost:3111";
    delete process.env["AGENTMEMORY_SECRET"];
  });

  afterEach(() => {
    resetHandleForTests();
    globalThis.fetch = originalFetch;
    delete process.env["AGENTMEMORY_URL"];
  });

  const args = {
    content: "rotate refresh tokens on every use",
    type: "pattern",
    concepts: ["auth", "jwt"],
    files: ["src/auth.ts"],
    ttlDays: 7,
    sourceObservationIds: ["obs_1", "obs_2"],
    project: "acme",
  };

  it("forwards the same remember payload from MCP, standalone and REST", async () => {
    const expected = {
      content: args.content,
      type: "pattern",
      concepts: ["auth", "jwt"],
      files: ["src/auth.ts"],
      ttlDays: 7,
      sourceObservationIds: ["obs_1", "obs_2"],
      project: "acme",
    };
    expect(await viaMcpServer(args)).toEqual(expected);
    expect(await viaRest(args)).toEqual(expected);
    expect(await viaStandalone(args)).toEqual(expected);
  });

  it("treats comma-separated strings the same as arrays", async () => {
    const asStrings = { ...args, concepts: "auth, jwt", files: "src/auth.ts" };
    expect(await viaMcpServer(asStrings)).toEqual(await viaMcpServer(args));
    expect(await viaRest(asStrings)).toEqual(await viaRest(args));
  });

  it("stores ttlDays and source ids in the standalone local fallback", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const localKv = new InMemoryKV(undefined);
    const before = Date.now();
    const res = await handleToolCall("memory_save", args, localKv);
    const id = JSON.parse(res.content[0].text).saved as string;
    const stored = (await localKv.get("mem:memories", id)) as Payload;
    expect(stored["concepts"]).toEqual(["auth", "jwt"]);
    expect(stored["sourceObservationIds"]).toEqual(["obs_1", "obs_2"]);
    const forgetAfter = new Date(String(stored["forgetAfter"])).getTime();
    expect(forgetAfter).toBeGreaterThanOrEqual(before + 7 * 86400000);
  });

  it("sets forgetAfter on the stored memory when ttlDays comes through MCP", async () => {
    vi.resetModules();
    const { registerRememberFunction } = await import("../src/functions/remember.js");
    const sdk = rememberSdk({ looseTrigger: true });
    registerRememberFunction(sdk as never, mockKV() as never);
    const payload = await viaMcpServer(args);
    const before = Date.now();
    const result = (await sdk.trigger("mem::remember", payload)) as {
      memory: { concepts: string[]; files: string[]; forgetAfter?: string; sourceObservationIds: string[] };
    };
    expect(result.memory.concepts).toEqual(["auth", "jwt"]);
    expect(result.memory.files).toEqual(["src/auth.ts"]);
    expect(result.memory.sourceObservationIds).toEqual(["obs_1", "obs_2"]);
    expect(new Date(result.memory.forgetAfter!).getTime()).toBeGreaterThanOrEqual(before + 7 * 86400000);
  });

  it("advertises ttlDays and sourceObservationIds in the tool schema", () => {
    const tool = getAllTools().find((t) => t.name === "memory_save")!;
    const props = tool.inputSchema.properties as Record<string, { type: string; items?: { type: string } }>;
    expect(props["ttlDays"]).toMatchObject({ type: "number" });
    expect(props["sourceObservationIds"]).toMatchObject({ type: "array", items: { type: "string" } });
  });
});

describe("memory_save argument validation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    resetHandleForTests();
    globalThis.fetch = originalFetch;
    delete process.env["AGENTMEMORY_URL"];
  });

  const invalid: Array<[Payload, string]> = [
    [{ sourceObservationIds: "obs_1" }, "sourceObservationIds must be an array"],
    [{ concepts: 5 }, "concepts must be a comma-separated string or an array of strings"],
    [{ files: ["src/a.ts", 3] }, "files must be a comma-separated string or an array of strings"],
    [{ ttlDays: 1e9 }, TTL_TOO_LARGE],
  ];

  it("reports invalid list fields and unrepresentable ttlDays", () => {
    for (const [fields, error] of invalid) expect(rememberFieldsError(fields)).toBe(error);
    expect(rememberFieldsError({ concepts: "auth, jwt", files: ["src/a.ts"], sourceObservationIds: ["obs_1"], ttlDays: 0.5 })).toBeUndefined();
    expect(ttlExpiry(1e9)).toBeNull();
    expect(ttlExpiry(0.5, 0)).toBe(new Date(43_200_000).toISOString());
  });

  it("rejects invalid fields with 400 on REST and MCP without calling mem::remember", async () => {
    for (const [fields, error] of invalid) {
      const body = { content: "deploy decision", ...fields };
      const rest = captureSdk();
      registerApiTriggers(rest as never, kvStub as never);
      const restRes = await rest.fn("api::remember")({ method: "POST", headers: { "content-type": "application/json" }, body });
      expect(restRes).toEqual({ status_code: 400, body: { error } });
      expect(rest.payloads).toHaveLength(0);
      const mcp = captureSdk();
      registerMcpEndpoints(mcp as never, kvStub as never);
      const mcpRes = await mcp.fn("mcp::tools::call")({ headers: {}, body: { name: "memory_save", arguments: body } });
      expect(mcpRes).toEqual({ status_code: 400, body: { error } });
      expect(mcp.payloads).toHaveLength(0);
    }
  });

  it("rejects invalid fields in the standalone server before saving", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const localKv = new InMemoryKV(undefined);
    for (const [fields, error] of invalid) {
      await expect(handleToolCall("memory_save", { content: "deploy decision", ...fields }, localKv)).rejects.toThrow(error);
    }
    expect(await localKv.list("mem:memories")).toEqual([]);
  });

  it("mem::remember refuses a ttlDays whose expiry cannot be represented", async () => {
    vi.resetModules();
    const { registerRememberFunction } = await import("../src/functions/remember.js");
    const sdk = rememberSdk({ looseTrigger: true });
    registerRememberFunction(sdk as never, mockKV() as never);
    expect(await sdk.trigger("mem::remember", { content: "temporary note", ttlDays: 1e9 })).toEqual({ success: false, error: TTL_TOO_LARGE });
  });
});

describe("standalone local fallback expiry", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.useRealTimers();
    resetHandleForTests();
    globalThis.fetch = originalFetch;
  });

  it("hides and prunes memories whose forgetAfter has passed", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const localKv = new InMemoryKV(undefined);
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:00Z"), toFake: ["Date"] });
    await handleToolCall("memory_save", { content: "temporary note", ttlDays: 0.001 }, localKv);
    await handleToolCall("memory_save", { content: "permanent note" }, localKv);
    const recall = async () => JSON.parse((await handleToolCall("memory_recall", { query: "note" }, localKv)).content[0].text);
    expect(JSON.stringify(await recall())).toContain("temporary note");
    vi.setSystemTime(new Date("2026-11-01T00:05:00Z"));
    const after = JSON.stringify(await recall());
    expect(after).toContain("permanent note");
    expect(after).not.toContain("temporary note");
    const smart = JSON.stringify(JSON.parse((await handleToolCall("memory_smart_search", { query: "note" }, localKv)).content[0].text));
    expect(smart).not.toContain("temporary note");
    const stored = await localKv.list<{ content: string }>("mem:memories");
    expect(stored.map((memory) => memory.content)).toEqual(["permanent note"]);
  });

  it("records an audit entry for each expired fallback memory it deletes", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const localKv = new InMemoryKV(undefined);
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:00Z"), toFake: ["Date"] });
    const saved = await handleToolCall("memory_save", { content: "temporary note", ttlDays: 0.001 }, localKv);
    const id = JSON.parse(saved.content[0].text).saved as string;
    vi.setSystemTime(new Date("2026-11-01T00:05:00Z"));
    await handleToolCall("memory_recall", { query: "note" }, localKv);
    const audit = JSON.parse((await handleToolCall("memory_audit", {}, localKv)).content[0].text) as {
      entries: Array<{ operation: string; targetIds: string[]; details: Record<string, unknown> }>;
    };
    const deletions = audit.entries.filter((entry) => entry.operation === "delete");
    expect(deletions).toHaveLength(1);
    expect(deletions[0].targetIds).toEqual([id]);
    expect(deletions[0].details).toMatchObject({ reason: "auto-forget TTL", resource: "memory", storage: "local" });
  });
});

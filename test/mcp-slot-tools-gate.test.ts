import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggered: string[] = [];
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      functions.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string }) => {
      triggered.push(input.function_id);
      return { slots: [] };
    },
    triggered,
    getFunction: (id: string) => functions.get(id)!,
  };
}

const kv = {
  get: async () => null,
  set: async (_s: string, _k: string, d: unknown) => d,
  delete: async () => {},
  list: async () => [],
};

function register() {
  const sdk = mockSdk();
  registerMcpEndpoints(sdk as never, kv as never);
  return sdk;
}

async function listedNames(sdk: ReturnType<typeof mockSdk>): Promise<string[]> {
  const res = await sdk.getFunction("mcp::tools::list")({ headers: {} });
  return (res.body.tools as Array<{ name: string }>).map((t) => t.name);
}

describe("MCP slot tools follow AGENTMEMORY_SLOTS", () => {
  let origFlag: string | undefined;

  beforeEach(() => {
    origFlag = process.env["AGENTMEMORY_SLOTS"];
  });

  afterEach(() => {
    if (origFlag !== undefined) process.env["AGENTMEMORY_SLOTS"] = origFlag;
    else delete process.env["AGENTMEMORY_SLOTS"];
  });

  it("hides memory_slot_* from tools/list when slots are disabled", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const names = await listedNames(register());
    expect(names).toContain("memory_recall");
    expect(names.some((n) => n.startsWith("memory_slot_"))).toBe(false);
  });

  it("answers a slot call with the slots-disabled 503 instead of triggering a missing function", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const sdk = register();
    const res = await sdk.getFunction("mcp::tools::call")({
      headers: {},
      body: { name: "memory_slot_list", arguments: {} },
    });
    expect(res.status_code).toBe(503);
    expect(res.body).toMatchObject({ error: "Memory slots not enabled", flag: "AGENTMEMORY_SLOTS" });
    expect(sdk.triggered).not.toContain("mem::slot-list");
  });

  it("keeps the unknown-tool response for a misspelled slot name", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const res = await register().getFunction("mcp::tools::call")({
      headers: {},
      body: { name: "memory_slot_lsit", arguments: {} },
    });
    expect(res.status_code).not.toBe(503);
    expect(JSON.stringify(res.body)).toContain("Unknown tool");
  });

  it("uses the flag value from registration, matching which slot functions were registered", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const sdk = register();
    process.env["AGENTMEMORY_SLOTS"] = "true";
    expect((await listedNames(sdk)).some((n) => n.startsWith("memory_slot_"))).toBe(false);
  });

  it("lists and routes slot tools when AGENTMEMORY_SLOTS=true", async () => {
    process.env["AGENTMEMORY_SLOTS"] = "true";
    const sdk = register();
    expect(await listedNames(sdk)).toContain("memory_slot_list");
    const res = await sdk.getFunction("mcp::tools::call")({
      headers: {},
      body: { name: "memory_slot_list", arguments: {} },
    });
    expect(res.status_code).toBe(200);
    expect(sdk.triggered).toContain("mem::slot-list");
  });
});

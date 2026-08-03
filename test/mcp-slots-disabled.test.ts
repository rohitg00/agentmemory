import { describe, expect, it, vi } from "vitest";

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => functions.set(id, handler),
    registerTrigger: () => {},
    trigger: vi.fn(async () => {
      throw new Error("slot function must not be called");
    }),
    getFunction: (id: string) => functions.get(id),
  };
}

describe("MCP slot feature gate", () => {
  it("returns a useful response instead of triggering a missing function", async () => {
    const original = process.env["AGENTMEMORY_SLOTS"];
    process.env["AGENTMEMORY_SLOTS"] = "false";
    const sdk = mockSdk();
    const kv = { list: vi.fn(), get: vi.fn() };
    registerMcpEndpoints(sdk as never, kv as never);

    try {
      const call = sdk.getFunction("mcp::tools::call")!;
      const result = (await call({
        body: { name: "memory_slot_list", arguments: {} },
        headers: {},
        query_params: {},
      })) as {
        status_code: number;
        body: { content: Array<{ text: string }> };
      };

      expect(result.status_code).toBe(200);
      expect(result.body.content[0].text).toContain("AGENTMEMORY_SLOTS=true");
      expect(sdk.trigger).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) delete process.env["AGENTMEMORY_SLOTS"];
      else process.env["AGENTMEMORY_SLOTS"] = original;
    }
  });
});

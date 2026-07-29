import { describe, expect, it, vi } from "vitest";

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockSdk() {
  const functions = new Map<string, Function>();
  const trigger = vi.fn(async () => ({ success: true }));
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger,
    getFunction: (id: string) => functions.get(id),
  };
}

describe("MCP LLM tools", () => {
  it("runs explicitly requested consolidation even when scheduling is disabled", async () => {
    const sdk = mockSdk();
    registerMcpEndpoints(sdk as never, {} as never);

    const callTool = sdk.getFunction("mcp::tools::call")!;
    const result = await callTool({
      headers: {},
      body: {
        name: "memory_consolidate",
        arguments: { tier: "semantic" },
      },
    });

    expect(result.status_code).toBe(200);
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::consolidate-pipeline",
      payload: { tier: "semantic", force: true },
    });
  });
});

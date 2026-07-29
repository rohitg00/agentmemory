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

  it("routes the workstation LLM and diagnostic tools to their engine functions", async () => {
    const sdk = mockSdk();
    registerMcpEndpoints(sdk as never, {} as never);
    const callTool = sdk.getFunction("mcp::tools::call")!;

    await callTool({
      headers: {},
      body: {
        name: "memory_enrich_session",
        arguments: {
          sessionId: "ses_123",
          lookback: 2,
          lookahead: 1,
          minImportance: 5,
        },
      },
    });
    await callTool({
      headers: {},
      body: {
        name: "memory_flow_compress",
        arguments: { actionIds: "act_1, act_2" },
      },
    });
    await callTool({
      headers: {},
      body: { name: "memory_diagnostic_followup", arguments: {} },
    });
    await callTool({
      headers: {},
      body: { name: "memory_llm_smoke", arguments: {} },
    });

    expect(sdk.trigger).toHaveBeenNthCalledWith(1, {
      function_id: "mem::enrich-session",
      payload: {
        sessionId: "ses_123",
        lookback: 2,
        lookahead: 1,
        minImportance: 5,
      },
    });
    expect(sdk.trigger).toHaveBeenNthCalledWith(2, {
      function_id: "mem::flow-compress",
      payload: { actionIds: ["act_1", "act_2"] },
    });
    expect(sdk.trigger).toHaveBeenNthCalledWith(3, {
      function_id: "mem::diagnostic::followup-stats",
      payload: {},
    });
    expect(sdk.trigger).toHaveBeenNthCalledWith(4, {
      function_id: "mem::llm-smoke",
      payload: {},
    });
  });

  it("rejects invalid enrich and flow-compress inputs before dispatch", async () => {
    const sdk = mockSdk();
    registerMcpEndpoints(sdk as never, {} as never);
    const callTool = sdk.getFunction("mcp::tools::call")!;

    await expect(
      callTool({
        headers: {},
        body: {
          name: "memory_enrich_session",
          arguments: { sessionId: "ses_123", minImportance: 11 },
        },
      }),
    ).resolves.toMatchObject({ status_code: 400 });
    await expect(
      callTool({
        headers: {},
        body: { name: "memory_flow_compress", arguments: {} },
      }),
    ).resolves.toMatchObject({ status_code: 400 });
    expect(sdk.trigger).not.toHaveBeenCalled();
  });
});

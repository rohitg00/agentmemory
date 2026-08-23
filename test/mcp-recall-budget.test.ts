import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockSdk(searchResult: unknown) {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      if (id === "mem::search") return searchResult;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(
        typeof idOrInput === "string" ? undefined : idOrInput.payload,
      );
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(arguments_: Record<string, unknown>) {
  return {
    body: { name: "memory_recall", arguments: arguments_ },
    headers: {},
    query_params: {},
  };
}

describe("MCP memory_recall token budget reporting (#1232)", () => {
  it("includes clipping and exclusion metadata in narrative output", async () => {
    const sdk = mockSdk({
      format: "narrative",
      results: [
        {
          title: "Auth decision",
          narrative: "Use rotating tokens.",
          content_truncated: true,
        },
      ],
      text: "1. Auth decision\nUse rotating tokens.",
      truncated: true,
      excluded_by_budget: 2,
    });
    registerMcpEndpoints(sdk as never, {} as never);

    const result = (await sdk.getFunction("mcp::tools::call")!(
      makeReq({ query: "auth", format: "narrative", token_budget: 200 }),
    )) as {
      status_code: number;
      body: { content: Array<{ type: string; text: string }> };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.content[0]?.text).toContain("1. Auth decision");
    expect(result.body.content[0]?.text).toContain(
      '[Budget metadata: {"content_truncated":true,"excluded_by_budget":2}]',
    );
  });

  it("leaves untruncated narrative output unchanged", async () => {
    const text = "1. Auth decision\nUse rotating tokens.";
    const sdk = mockSdk({
      format: "narrative",
      results: [{ title: "Auth decision", narrative: "Use rotating tokens." }],
      text,
      truncated: false,
    });
    registerMcpEndpoints(sdk as never, {} as never);

    const result = (await sdk.getFunction("mcp::tools::call")!(
      makeReq({ query: "auth", format: "narrative" }),
    )) as {
      body: { content: Array<{ type: string; text: string }> };
    };

    expect(result.body.content[0]?.text).toBe(text);
  });
});

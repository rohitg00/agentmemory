import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools } from "../src/mcp/tools-registry.js";

function mockSdk() {
  const functions = new Map<string, Function>();
  const calls: Array<{ function_id: string; payload: Record<string, unknown> }> = [];
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      functions.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: Record<string, unknown> }) => {
      calls.push(input);
      return { action: "created" };
    },
    calls,
    getFunction: (id: string) => functions.get(id)!,
  };
}

const kv = {
  get: async () => null,
  set: async (_s: string, _k: string, d: unknown) => d,
  delete: async () => {},
  list: async () => [],
};

async function callLessonSave(args: Record<string, unknown>) {
  const sdk = mockSdk();
  registerMcpEndpoints(sdk as never, kv as never);
  const res = await sdk.getFunction("mcp::tools::call")({
    headers: {},
    body: { name: "memory_lesson_save", arguments: args },
  });
  return { res, calls: sdk.calls };
}

describe("memory_lesson_save sourceIds", () => {
  it("advertises sourceIds as a string array in the tool schema", () => {
    const tool = getAllTools().find((t) => t.name === "memory_lesson_save")!;
    const props = tool.inputSchema.properties as Record<string, { type: string; items?: { type: string } }>;
    expect(props["sourceIds"]).toMatchObject({ type: "array", items: { type: "string" } });
  });

  it("forwards normalized sourceIds to mem::lesson-save", async () => {
    const { res, calls } = await callLessonSave({
      content: "Run skills:check before pushing",
      sourceIds: [" ses_1 ", "obs_2", "ses_1"],
    });
    expect(res.status_code).toBe(200);
    expect(calls[0]!.function_id).toBe("mem::lesson-save");
    expect(calls[0]!.payload["sourceIds"]).toEqual(["ses_1", "obs_2"]);
  });

  it("keeps an empty list when sourceIds is omitted", async () => {
    const { calls } = await callLessonSave({ content: "A lesson" });
    expect(calls[0]!.payload["sourceIds"]).toEqual([]);
  });

  it("rejects invalid sourceIds with 400 and does not save", async () => {
    const { res, calls } = await callLessonSave({ content: "A lesson", sourceIds: "ses_1" });
    expect(res.status_code).toBe(400);
    expect(String((res.body as { error: string }).error)).toContain("sourceIds must be an array");
    expect(calls).toHaveLength(0);
  });
});

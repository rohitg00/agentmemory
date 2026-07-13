import { describe, expect, it, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";

function wireContext() {
  let handler: ((data: Record<string, unknown>) => Promise<unknown>) | undefined;
  let request: Record<string, unknown> | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, callback: (data: Record<string, unknown>) => Promise<unknown>) => {
      if (id === "mem::context") handler = callback;
    }),
  } as unknown as import("iii-sdk").ISdk;
  const recallCore = {
    recall: vi.fn(async (input: Record<string, unknown>) => {
      request = input;
      return { context: "", results: [], trace: { finalContextTokenCount: 0, id: "trace" } };
    }),
  };
  registerContextFunction(sdk, {} as never, 100, recallCore as never);
  if (!handler) throw new Error("mem::context not registered");
  return { handler, getRequest: () => request };
}

describe("mem::context recall limit propagation", () => {
  it.each([7, 0])("forwards limit=%s without applying a truthiness default", async (limit) => {
    const { handler, getRequest } = wireContext();
    await handler({ sessionId: "session", project: "project", query: "query", outputMode: "ranked_results", limit });
    expect(getRequest()).toMatchObject({ limit });
  });
});

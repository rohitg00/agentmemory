import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";

// The REST layer parses the result count itself before handing off to
// mem::vision-search, so the alias fixed in the function core does not reach
// callers of this endpoint unless it is honoured here too (#1254).

const SECRET = "vision-api-test-secret";

function mockKV() {
  return {
    get: async () => null,
    set: async <T>(_s: string, _k: string, d: T) => d,
    delete: async () => {},
    update: async () => {},
    list: async () => [],
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  const seen: Record<string, unknown>[] = [];
  return {
    registerFunction: (id: string, h: Function) => fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) => {
      if (input.function_id === "mem::vision-search") {
        seen.push((input.payload ?? {}) as Record<string, unknown>);
        return { success: true, results: [] };
      }
      return fns.get(input.function_id)?.(input.payload);
    },
    _fns: fns,
    _seen: seen,
  };
}

async function visionSearch(
  sdk: ReturnType<typeof mockSdk>,
  body: Record<string, unknown>,
): Promise<{ status_code: number; body: Record<string, unknown> }> {
  const handler = sdk._fns.get("api::vision-search")!;
  return handler({
    headers: { authorization: `Bearer ${SECRET}` },
    body,
  });
}

function freshApi() {
  const sdk = mockSdk();
  registerApiTriggers(sdk as never, mockKV() as never, SECRET);
  return sdk;
}

describe("api::vision-search result count", () => {
  it("forwards `limit` as topK (#1254)", async () => {
    const sdk = freshApi();

    const res = await visionSearch(sdk, { queryText: "a red square", limit: 24 });

    expect(res.status_code).toBe(200);
    expect(sdk._seen[0]?.["topK"]).toBe(24);
  });

  it("prefers topK when both topK and limit are given (#1254)", async () => {
    const sdk = freshApi();

    await visionSearch(sdk, { queryText: "a red square", topK: 2, limit: 9 });

    expect(sdk._seen[0]?.["topK"]).toBe(2);
  });

  it("sends no topK when neither key is given, leaving the default to the function (#1254)", async () => {
    const sdk = freshApi();

    await visionSearch(sdk, { queryText: "a red square" });

    expect(sdk._seen[0]).not.toHaveProperty("topK");
  });

  it("clamps an oversized limit to 50 like topK (#1254)", async () => {
    const sdk = freshApi();

    await visionSearch(sdk, { queryText: "a red square", limit: 5000 });

    expect(sdk._seen[0]?.["topK"]).toBe(50);
  });

  it("rejects a non-positive limit instead of silently defaulting (#1254)", async () => {
    const sdk = freshApi();

    const res = await visionSearch(sdk, { queryText: "a red square", limit: 0 });

    expect(res.status_code).toBe(400);
    expect(sdk._seen).toHaveLength(0);
  });

  it("rejects a malformed limit the same way it rejects a malformed topK (#1254)", async () => {
    const sdk = freshApi();

    const res = await visionSearch(sdk, { queryText: "a red square", limit: "many" });

    expect(res.status_code).toBe(400);
    expect(sdk._seen).toHaveLength(0);
  });
});

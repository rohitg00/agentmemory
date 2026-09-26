import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import type { HttpRequest } from "@iii-dev/helpers/http";

function mockKV() {
  return {
    get: async () => null,
    set: async <T>(_s: string, _k: string, d: T) => d,
    delete: async () => {},
    update: async () => {},
    list: async <T>(): Promise<T[]> => [],
  };
}

function mockSdk() {
  const fns = new Map<string, (payload: unknown) => Promise<unknown>>();
  return {
    registerFunction: (id: string, h: (payload: unknown) => Promise<unknown>) =>
      fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
  };
}

async function callPatterns(
  sdk: ReturnType<typeof mockSdk>,
  body?: Record<string, unknown>,
): Promise<{ status_code: number; body: Record<string, unknown> }> {
  const handler = sdk._fns.get("api::patterns")!;
  return handler({
    headers: {},
    query_params: {},
    body,
  } as HttpRequest<Record<string, unknown>>) as Promise<{
    status_code: number;
    body: Record<string, unknown>;
  }>;
}

describe("api::patterns request hygiene", () => {
  it("defaults a bodyless request instead of throwing", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    let received: unknown;
    sdk.registerFunction("mem::patterns", async (payload) => {
      received = payload;
      return { patterns: [] };
    });
    registerApiTriggers(sdk as never, kv as never);

    const res = await callPatterns(sdk);

    expect(res.status_code).toBe(200);
    expect(received).toEqual({ project: undefined, limit: undefined });
  });

  it("whitelists the body to project and limit, dropping unexpected fields", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    let received: unknown;
    sdk.registerFunction("mem::patterns", async (payload) => {
      received = payload;
      return { patterns: [] };
    });
    registerApiTriggers(sdk as never, kv as never);

    await callPatterns(sdk, {
      project: "alpha",
      limit: 5,
      extra: "should not pass through",
    });

    expect(received).toEqual({ project: "alpha", limit: 5 });
  });
});

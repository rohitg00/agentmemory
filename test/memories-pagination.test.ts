import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { registerRememberFunction } from "../src/functions/remember.js";
import { KV } from "../src/state/schema.js";
import { registerApiTriggers } from "../src/triggers/api.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggers: Array<unknown> = [];
  return {
    functions,
    triggers,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: (trigger: unknown) => {
      triggers.push(trigger);
    },
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`unknown fn ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

// /memories and /export must support count + pagination so the
// viewer and `agentmemory status` work on large corpora (8K+ memories)
// without timing out at the iii engine boundary.
describe("memories + export pagination (#544)", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");

  it("api::memories accepts count=true and returns total + latestCount", () => {
    expect(api).toMatch(/req\.query_params\?\.\["count"\]\s*===\s*"true"/);
    // count must report the SAME scope as the list path (#554 follow-up).
    expect(api).toMatch(/total:\s*filtered\.length/);
    expect(api).toMatch(/latestCount:\s*filtered\.filter/);
  });

  it("api::memories accepts limit + offset query params", () => {
    expect(api).toMatch(/query_params\?\.\["limit"\]/);
    expect(api).toMatch(/query_params\?\.\["offset"\]/);
    expect(api).toMatch(/filtered\.slice\(offset/);
    expect(api).toMatch(/total:\s*filtered\.length/);
  });

  it("api::memories caps limit at 5000 to bound response size", () => {
    expect(api).toMatch(/Math\.min\(parsedLimit,\s*5000\)/);
  });

  it("api::export passes through maxSessions + offset query params", () => {
    expect(api).toMatch(/query_params\?\.\["maxSessions"\]/);
    expect(api).toMatch(/query_params\?\.\["offset"\]/);
    // The payload object is named `payload` in our handler; assert it is
    // forwarded to mem::export rather than the previous empty object.
    expect(api).toMatch(
      /sdk\.trigger\(\{\s*function_id:\s*"mem::export",\s*payload,/m,
    );
  });

  it("viewer dashboard caps memories?latest fetch with limit", () => {
    const viewer = readFileSync("src/viewer/index.html", "utf-8");
    expect(viewer).toMatch(/memories\?latest=true&limit=500/);
    expect(viewer).toMatch(/memories\?latest=true&limit=2000/);
  });

  it("registers DELETE /agentmemory/memories/:id through mem::forget (#739)", () => {
    expect(api).toMatch(/registerFunction\("api::memory-delete"/);
    expect(api).toMatch(/api_path:\s*"\/agentmemory\/memories\/:id"/);
    expect(api).toMatch(/http_method:\s*"DELETE"/);
    expect(api).toMatch(/function_id:\s*"mem::forget",\s*payload:\s*\{\s*memoryId:\s*id\s*\}/m);
  });

  it("DELETE /agentmemory/memories/:id removes the addressed memory (#739)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);

    await kv.set(KV.memories, "mem_delete_me", {
      id: "mem_delete_me",
      content: "outdated memory",
      type: "fact",
    });

    const handler = sdk.functions.get("api::memory-delete");
    expect(handler).toBeTypeOf("function");

    const response = await handler!({
      path_params: { id: "mem_delete_me" },
      headers: {},
    });

    expect(response.status_code).toBe(200);
    expect(await kv.get(KV.memories, "mem_delete_me")).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";
import type { Memory } from "../src/types.js";

// A project-scoped mesh export must filter memories like actions: unscoped
// memories leak across projects and can push the payload past the transport
// frame limit even when the requested project's own slice fits.

const SECRET = "mesh-test-secret";

function mockKV(store = new Map<string, Map<string, unknown>>()) {
  return {
    get: async () => null,
    set: async <T>(s: string, k: string, d: T) => {
      if (!store.has(s)) store.set(s, new Map());
      store.get(s)!.set(k, d);
      return d;
    },
    delete: async () => {},
    update: async () => {},
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    _store: store,
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, h: Function) => fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
  };
}

function memory(id: string, project: string, content = "x"): Memory {
  return {
    id,
    type: "pattern",
    title: id,
    content,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 5,
    version: 1,
    isLatest: true,
    project,
  };
}

async function meshExport(
  sdk: ReturnType<typeof mockSdk>,
  project?: string,
  extra?: Record<string, string>,
): Promise<{ status_code: number; body: Record<string, unknown> }> {
  const handler = sdk._fns.get("api::mesh-export")!;
  return handler({
    headers: { authorization: `Bearer ${SECRET}` },
    query_params: { ...(project ? { project } : {}), ...extra },
  });
}

describe("api::mesh-export project scoping", () => {
  it("excludes other projects' memories from a project-scoped export", async () => {
    const kv = mockKV();
    await kv.set(KV.memories, "m-alpha", memory("m-alpha", "alpha"));
    await kv.set(KV.memories, "m-beta", memory("m-beta", "beta"));
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const res = await meshExport(sdk, "alpha");

    expect(res.status_code).toBe(200);
    const memories = res.body.memories as Memory[];
    expect(memories.map((m) => m.id)).toEqual(["m-alpha"]);
    expect(memories.some((m) => m.project === "beta")).toBe(false);
  });

  it("returns all memories when no project is provided", async () => {
    const kv = mockKV();
    await kv.set(KV.memories, "m-alpha", memory("m-alpha", "alpha"));
    await kv.set(KV.memories, "m-beta", memory("m-beta", "beta"));
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const res = await meshExport(sdk);

    expect(res.status_code).toBe(200);
    const memories = res.body.memories as Memory[];
    expect(memories.map((m) => m.id).sort()).toEqual(["m-alpha", "m-beta"]);
  });

  it("avoids the 413 when only another project's memory is oversized", async () => {
    const kv = mockKV();
    // A single beta memory alone blows the frame; alpha's slice is tiny.
    await kv.set(
      KV.memories,
      "m-beta-huge",
      memory("m-beta-huge", "beta", "z".repeat(SAFE_PAYLOAD_BYTES + 4096)),
    );
    await kv.set(KV.memories, "m-alpha", memory("m-alpha", "alpha"));
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, kv as never, SECRET);

    // Scoped to alpha: the huge beta memory is filtered out before the frame
    // guard runs, so the request succeeds instead of 413-ing.
    const scoped = await meshExport(sdk, "alpha");
    expect(scoped.status_code).toBe(200);
    expect((scoped.body.memories as Memory[]).map((m) => m.id)).toEqual([
      "m-alpha",
    ]);

    // Unscoped: the oversized memory is included, so the guard fires (413).
    const unscoped = await meshExport(sdk);
    expect(unscoped.status_code).toBe(413);
    expect((unscoped.body as { oversized?: boolean }).oversized).toBe(true);
  });
});

describe("api::mesh-export cursor paging", () => {
  it("does not skip surviving rows when a row is deleted between pages", async () => {
    const kv = mockKV();
    for (const id of ["m-1", "m-2", "m-3", "m-4", "m-5"]) {
      await kv.set(KV.memories, id, memory(id, "alpha"));
    }
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const res = await meshExport(sdk, "alpha", { limit: "2", ...(cursor ? { cursor } : {}) });
      expect(res.status_code).toBe(200);
      seen.push(...(res.body.memories as Memory[]).map((m) => m.id));
      cursor = res.body.nextCursor as string | undefined;
      if (seen.length === 2) kv._store.get(KV.memories)!.delete("m-1");
      if (!cursor) break;
    }
    expect(seen.sort()).toEqual(["m-1", "m-2", "m-3", "m-4", "m-5"]);
    expect(new Set(seen).size).toBe(5);
  });

  it("rejects an invalid cursor with 400", async () => {
    const kv = mockKV();
    await kv.set(KV.memories, "m-1", memory("m-1", "alpha"));
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const bad = await meshExport(sdk, "alpha", { cursor: "not-a-cursor" });
    expect(bad.status_code).toBe(400);
    expect((bad.body as { error?: string }).error).toBe("invalid_cursor");

    const outOfRange = await meshExport(sdk, "alpha", {
      cursor: Buffer.from(JSON.stringify({ c: 99, after: "m-1" })).toString("base64url"),
    });
    expect(outOfRange.status_code).toBe(400);
    expect((outOfRange.body as { error?: string }).error).toBe("invalid_cursor");
  });
});

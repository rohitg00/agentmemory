import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  checkPayloadFrameSize,
  oversizedPayloadError,
  payloadByteLength,
  SAFE_PAYLOAD_BYTES,
  FRAME_LIMIT_BYTES_FOR_TEST,
} from "../src/state/frame-guard.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

// The guard must catch an oversized payload before the return so the frame
// that would drop the worker is never shipped.

describe("frame-guard", () => {
  it("keeps the safe cap under the 16 MiB frame limit with headroom", () => {
    expect(SAFE_PAYLOAD_BYTES).toBeLessThan(FRAME_LIMIT_BYTES_FOR_TEST);
    expect(FRAME_LIMIT_BYTES_FOR_TEST - SAFE_PAYLOAD_BYTES).toBeGreaterThanOrEqual(
      1024 * 1024,
    );
  });

  it("passes payloads at or under the cap", () => {
    expect(checkPayloadFrameSize({ ok: true }, "hint")).toBeNull();
    // A string just under the cap (account for JSON quotes).
    const almost = "x".repeat(SAFE_PAYLOAD_BYTES - 2);
    expect(payloadByteLength(almost)).toBeLessThanOrEqual(SAFE_PAYLOAD_BYTES);
    expect(checkPayloadFrameSize(almost, "hint")).toBeNull();
  });

  it("flags payloads over the cap with byte count and hint", () => {
    const big = "x".repeat(SAFE_PAYLOAD_BYTES + 1024);
    const res = checkPayloadFrameSize(big, "narrow the range");
    expect(res).not.toBeNull();
    expect(res!.oversized).toBe(true);
    expect(res!.success).toBe(false);
    expect(res!.bytes).toBeGreaterThan(SAFE_PAYLOAD_BYTES);
    expect(res!.limitBytes).toBe(SAFE_PAYLOAD_BYTES);
    expect(res!.error).toContain("narrow the range");
    expect(res!.error).toMatch(/MiB/);
  });

  it("reports the size in MiB", () => {
    const err = oversizedPayloadError(20 * 1024 * 1024, "do X");
    expect(err.error).toContain("20.0 MiB");
  });
});

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

function mockSdk(kv: ReturnType<typeof mockKV>) {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, h: Function) => fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
    _kv: kv,
  } as never;
}

describe("mem::export frame guard", () => {
  it("returns the export object when it fits under the frame limit", async () => {
    const kv = mockKV();
    await kv.set(KV.sessions, "s1", {
      id: "s1",
      project: "p",
      cwd: "/p",
      startedAt: "2026-08-01T00:00:00Z",
      status: "completed",
      observationCount: 0,
    } as Session);
    const sdk = mockSdk(kv);
    registerExportImportFunction(sdk, kv as never);
    const result = (await (sdk as any).trigger({
      function_id: "mem::export",
      payload: {},
    })) as { version?: string; oversized?: boolean };
    expect(result.oversized).toBeUndefined();
    expect(result.version).toBeDefined();
  });

  it("returns a clean oversized error (not the object) when the export exceeds the cap", async () => {
    const kv = mockKV();
    // One memory whose content alone pushes the serialized export past the cap.
    const huge = "z".repeat(SAFE_PAYLOAD_BYTES + 4096);
    await kv.set(KV.memories, "m1", {
      id: "m1",
      type: "pattern",
      title: "big",
      content: huge,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      concepts: [],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: true,
    });
    const sdk = mockSdk(kv);
    registerExportImportFunction(sdk, kv as never);
    const result = (await (sdk as any).trigger({
      function_id: "mem::export",
      payload: {},
    })) as { oversized?: boolean; success?: boolean; bytes?: number; version?: string };

    // The giant object is never returned; a small error object is.
    expect(result.oversized).toBe(true);
    expect(result.success).toBe(false);
    expect(result.bytes).toBeGreaterThan(SAFE_PAYLOAD_BYTES);
    expect(result.version).toBeUndefined();
    // The error object itself is tiny (would never blow the frame).
    expect(payloadByteLength(result)).toBeLessThan(2048);
  });
});

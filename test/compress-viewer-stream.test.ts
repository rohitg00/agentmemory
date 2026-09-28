import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ add: vi.fn() }),
  vectorIndexAddGuarded: vi.fn().mockResolvedValue(false),
  scheduleIndexSave: vi.fn(),
}));

import { registerCompressFunction } from "../src/functions/compress.js";
import { STREAM } from "../src/state/schema.js";
import type { MemoryProvider, RawObservation } from "../src/types.js";

const VALID_COMPRESS_XML = `<type>command_run</type>
<title>Ran a probe command</title>
<facts><fact>Ran echo probe</fact></facts>
<narrative>The agent ran a probe command</narrative>
<concepts><concept>testing</concept></concepts>
<files></files>
<importance>5</importance>`;

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async () => null,
    set: async (scope: string, key: string, data: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async () => {},
    list: async () => [],
  };
}

describe("compress no longer writes a per-session mem-live group", () => {
  it("only targets the viewer group on stream:: calls", async () => {
    const trigger = vi.fn(async () => undefined);
    const sdk = { trigger } as never;
    const kv = mockKV() as never;

    const provider: MemoryProvider = {
      name: "mock",
      compress: async () => VALID_COMPRESS_XML,
      summarize: async () => "",
    };

    let compressCallback:
      | ((payload: {
          observationId: string;
          sessionId: string;
          raw: RawObservation;
        }) => Promise<unknown>)
      | null = null;
    const registerSdk = {
      trigger,
      registerFunction: (
        idOrOpts: string | { id: string },
        fn: typeof compressCallback,
      ) => {
        const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
        if (id === "mem::compress") compressCallback = fn;
      },
    };
    registerCompressFunction(registerSdk as never, kv, provider);
    expect(compressCallback).not.toBeNull();

    const sessionId = "ses_compress_stream_test";
    const raw: RawObservation = {
      id: "obs_1",
      sessionId,
      hookType: "post_tool_use",
      toolName: "Bash",
      toolInput: { command: "echo probe" },
      toolOutput: "probe output",
      timestamp: new Date().toISOString(),
      raw: {},
    };

    await compressCallback!({
      observationId: "obs_1",
      sessionId,
      raw,
    });

    const streamCalls = trigger.mock.calls
      .map((c) => c[0] as { function_id: string; payload: { group_id?: string } })
      .filter((c) => c.function_id.startsWith("stream::"));

    expect(streamCalls.length).toBeGreaterThan(0);
    for (const call of streamCalls) {
      expect(call.payload.group_id).not.toBe(sessionId);
      expect(call.payload.group_id).toBe(STREAM.viewerGroup);
    }
  });
});

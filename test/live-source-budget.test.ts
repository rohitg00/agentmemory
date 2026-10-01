import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompressedObservation, RawObservation } from "../src/types.js";
import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { withoutObservationSource } from "../src/functions/observation-source.js";
import { SESSION_SOURCE_MAX_BYTES } from "../src/functions/observation-source-budget.js";
import { getSearchIndex, setEmbeddingProvider, setVectorIndex } from "../src/functions/search.js";
import { payloadByteLength, SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";
import { KV } from "../src/state/schema.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const sessionId = "live-source-budget";
const scope = KV.observations(sessionId);
const output = "captured evidence ".repeat(1500);
const xml = "<type>file_read</type><title>Read configuration</title><facts><fact>Port configured</fact></facts><narrative>Read the configuration file.</narrative><concepts><concept>config</concept></concepts><files></files><importance>5</importance>";

function raw(id: string): RawObservation {
  return { id, sessionId, timestamp: "2026-09-30T00:00:00Z", hookType: "post_tool_use", toolName: "Read", toolOutput: output, raw: {} };
}

function rig(mode: "observe" | "compress") {
  const store = new Map<string, Map<string, any>>();
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const kv = {
    get: async (key: string, id: string) => store.get(key)?.get(id) ?? null,
    list: async (key: string) => {
      const rows = [...(store.get(key)?.values() ?? [])];
      await Promise.resolve();
      return rows;
    },
    set: async (key: string, id: string, value: unknown) => {
      if (!store.has(key)) store.set(key, new Map());
      store.get(key)!.set(id, value);
      return value;
    },
    update: vi.fn(),
  };
  const sdk = {
    registerFunction: (id: string, handler: (data: any) => Promise<any>) => handlers.set(id, handler),
    trigger: vi.fn(async () => ({})),
  };
  registerObserveFunction(sdk as never, kv as never);
  registerCompressFunction(sdk as never, kv as never, { name: "test", compress: vi.fn(async () => xml), summarize: vi.fn() });
  let nextId = 0;
  async function write(id = `live-${nextId++}`): Promise<CompressedObservation> {
    if (mode === "compress") {
      const result = await handlers.get("mem::compress")!({ observationId: id, sessionId, raw: raw(id) });
      expect(result.success).toBe(true);
    } else {
      const result = await handlers.get("mem::observe")!({ sessionId, timestamp: raw(id).timestamp, hookType: "post_tool_use", data: { tool_name: "Read", tool_output: output } });
      id = result.observationId;
    }
    return kv.get(scope, id);
  }
  async function seedSource() {
    const template = buildSyntheticCompression(raw("seed"));
    for (let i = 0; i < 511; i++) await kv.set(scope, `seed-${i}`, { ...template, id: `seed-${i}` });
  }
  return { kv, write, seedSource };
}

function sourceBytes(rows: CompressedObservation[]): number {
  return rows.reduce((sum, row) => sum + (row.source ? payloadByteLength(row.source) + 10 : 0), 0);
}

beforeEach(() => {
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
  getSearchIndex().clear();
  setVectorIndex(null);
  setEmbeddingProvider(null);
});
afterEach(() => vi.unstubAllEnvs());

describe.each(["observe", "compress"] as const)("live %s source budget", (mode) => {
  it("truncates to the remaining session allowance, then omits source while preserving summaries", async () => {
    const expected = withoutObservationSource(await rig(mode).write());
    const r = rig(mode);
    await r.seedSource();
    const first = await r.write();
    expect(first.source?.truncated).toBe(true);
    expect(payloadByteLength(first.source)).toBeLessThan(payloadByteLength(buildSyntheticCompression(raw("unbounded")).source));
    const second = await r.write();
    expect(second.source).toBeUndefined();
    expect(withoutObservationSource(second)).toEqual({ ...expected, id: second.id });
    const rows = await r.kv.list(scope);
    expect(sourceBytes(rows)).toBeLessThanOrEqual(SESSION_SOURCE_MAX_BYTES);
    expect(payloadByteLength({ result: rows })).toBeLessThan(SAFE_PAYLOAD_BYTES);
  });

  it("reduces source for transport headroom before the source allowance is exhausted", async () => {
    const r = rig(mode);
    const seed = withoutObservationSource(buildSyntheticCompression(raw("summary-seed")));
    seed.narrative = "s".repeat(SAFE_PAYLOAD_BYTES - 64 * 1024 - 6000);
    await r.kv.set(scope, seed.id, seed);
    const saved = await r.write();
    expect(saved.source?.truncated).toBe(true);
    expect(payloadByteLength(saved.source)).toBeLessThan(6000);
    expect(saved.source?.toolName).toBe("Read");
    expect(payloadByteLength({ result: await r.kv.list(scope) })).toBeLessThan(SAFE_PAYLOAD_BYTES);
  });

  it("preserves a completed summary when existing summaries leave no frame allowance", async () => {
    const expected = withoutObservationSource(await rig(mode).write());
    const r = rig(mode);
    const seed = withoutObservationSource(buildSyntheticCompression(raw("oversized-summary")));
    seed.narrative = "s".repeat(SAFE_PAYLOAD_BYTES);
    await r.kv.set(scope, seed.id, seed);
    const saved = await r.write();
    expect(saved.source).toBeUndefined();
    expect(withoutObservationSource(saved)).toEqual({ ...expected, id: saved.id });
  });
});

it("serializes concurrent model-compression writes against the remaining source budget", async () => {
  const r = rig("compress");
  await r.seedSource();
  const saved = await Promise.all([r.write(), r.write()]);
  expect(saved.filter((row) => row.source)).toHaveLength(1);
  expect(sourceBytes(await r.kv.list(scope))).toBeLessThanOrEqual(SESSION_SOURCE_MAX_BYTES);
});

it("credits a replaced observation's retained source when model compression rewrites it", async () => {
  const r = rig("compress");
  await r.seedSource();
  const first = await r.write("replaced");
  const rewritten = await r.write("replaced");
  expect(rewritten.source).toEqual(first.source);
  expect(sourceBytes(await r.kv.list(scope))).toBeLessThanOrEqual(SESSION_SOURCE_MAX_BYTES);
});

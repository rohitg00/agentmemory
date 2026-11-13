import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerObserveFunction } from "../src/functions/observe.js";
import { applyUpdateOps, StateKV, type StateBackend } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, HookPayload } from "../src/types.js";
import { SESSION_SOURCE_MAX_BYTES } from "../src/functions/observation-source-budget.js";

const indexed = vi.hoisted(() => new Map<string, CompressedObservation>());
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({
    has: (id: string) => indexed.has(id),
    add: (row: CompressedObservation) => indexed.set(row.id, structuredClone(row)),
    remove: (id: string) => indexed.delete(id),
  }),
  getVectorIndex: () => null,
  scheduleIndexSave: () => {},
  vectorIndexAddGuarded: async () => false,
  vectorIndexRemove: () => {},
}));
vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SESSION = "ses_durable_lookup";
const SCOPE = KV.observations(SESSION);
const ID = "obs_replay0001";
const TIMESTAMP = "2026-11-12T00:00:00.000Z";
type Call = { function_id: string; payload: { scope?: string; key?: string; value?: unknown; ops?: Parameters<typeof applyUpdateOps>[1] } };

function row(id = ID): CompressedObservation {
  return {
    id, sessionId: SESSION, timestamp: TIMESTAMP, type: "command_run",
    title: "Persisted command", facts: [], narrative: "Stored result", concepts: [], files: [], importance: 5,
  };
}

function payload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    sessionId: SESSION, project: "fixture", cwd: "/tmp/fixture", hookType: "post_tool_use", timestamp: TIMESTAMP,
    observationId: ID, data: { tool_name: "Bash", tool_input: { command: "echo fixture" }, tool_output: "fixture" },
    ...overrides,
  };
}

function fixture(options: { backend?: StateBackend; rejectList?: boolean; rejectPointRead?: boolean; cap?: number } = {}) {
  const data = new Map<string, Map<string, unknown>>([
    [SCOPE, new Map([[ID, row()], ["obs_unrelated1", { ...row("obs_unrelated1"), narrative: "x".repeat(32768) }]])],
    [KV.sessions, new Map([[SESSION, { id: SESSION, project: "fixture", status: "active", observationCount: 2 }]])],
  ]);
  const calls: Call[] = [];
  const handlers = new Map<string, (data: HookPayload) => Promise<unknown>>();
  const sdk = {
    registerFunction: (id: string, handler: (data: HookPayload) => Promise<unknown>) => handlers.set(id, handler),
    trigger: async (call: Call): Promise<unknown> => {
      calls.push(structuredClone(call));
      if (!call.function_id.startsWith("state::")) return null;
      const scope = call.payload.scope!;
      if (!data.has(scope)) data.set(scope, new Map());
      const entries = data.get(scope)!;
      const key = call.payload.key!;
      if (call.function_id === "state::get") {
        if (scope === SCOPE && options.rejectPointRead) throw new Error("point read unavailable");
        return structuredClone(entries.get(key) ?? null);
      }
      if (call.function_id === "state::list") {
        if (scope === SCOPE && options.rejectList) throw new Error("whole observation list unavailable");
        return structuredClone([...entries.values()]);
      }
      if (call.function_id === "state::list_keys") {
        const keys = [...entries.keys()];
        return options.backend === "redis" ? { keys } : keys;
      }
      if (call.function_id === "state::set") {
        entries.set(key, structuredClone(call.payload.value));
        return call.payload.value;
      }
      if (call.function_id === "state::delete") return entries.delete(key);
      if (call.function_id === "state::update") {
        const old_value = structuredClone(entries.get(key) ?? null);
        const new_value = applyUpdateOps(old_value, call.payload.ops!);
        entries.set(key, new_value);
        return { old_value, new_value, errors: [] };
      }
      throw new Error(`Unexpected state invocation: ${call.function_id}`);
    },
  };
  const kv = new StateKV(sdk as never, { backend: options.backend });
  registerObserveFunction(sdk as never, kv, undefined, options.cap);
  const observe = (body = payload()) => handlers.get("mem::observe")!(body) as Promise<Record<string, unknown>>;
  const observationLists = () => calls.filter((call) => call.payload.scope === SCOPE && call.function_id === "state::list");
  return { data, calls, observe, observationLists };
}

beforeEach(() => {
  indexed.clear();
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("durable observation lookup", () => {
  it.each(["file", "redis"] as const)("replays the stored record without loading its session on %s", async (backend) => {
    const f = fixture({ backend });
    const before = structuredClone(f.data);
    expect(await f.observe()).toEqual({ observationId: ID, deduplicated: true, existing: true });
    expect(indexed.get(ID)).toEqual(row());
    expect(f.data).toEqual(before);
    expect(f.observationLists()).toEqual([]);
  });

  it("can replay a point-readable record when the whole session cannot be read", async () => {
    const f = fixture({ rejectList: true });
    expect(await f.observe()).toEqual({ observationId: ID, deduplicated: true, existing: true });
    expect(indexed.get(ID)).toEqual(row());
    expect(f.observationLists()).toEqual([]);
  });

  it("records a replayed live prompt and restores its index without reading other observations", async () => {
    const f = fixture();
    expect(await f.observe(payload({ hookType: "prompt_submit", data: { prompt: "repair the fixture" } }))).toMatchObject({ existing: true, observationId: ID });
    const ledgers = [...f.data.get(KV.capturePrompts)!.values()] as Array<{ prompts: Record<string, { live: string[]; claimed: string[] }> }>;
    expect(ledgers).toHaveLength(1);
    expect(Object.values(ledgers[0]!.prompts)).toEqual([{ live: [ID], claimed: [] }]);
    expect(indexed.get(ID)).toEqual(row());
    expect(f.observationLists()).toEqual([]);
  });

  it("keeps the working list fallback if the point read fails", async () => {
    const f = fixture({ rejectPointRead: true });
    expect(await f.observe()).toMatchObject({ existing: true, observationId: ID });
    expect(indexed.get(ID)).toEqual(row());
    expect(f.observationLists()).toHaveLength(1);
  });

  it("retains legacy ID matching when a row is stored under a different key", async () => {
    const f = fixture();
    f.data.get(SCOPE)!.delete(ID);
    f.data.get(SCOPE)!.set("legacy-key", row());
    expect(await f.observe()).toMatchObject({ existing: true, observationId: ID });
    expect(indexed.get(ID)).toEqual(row());
    expect([...f.data.get(SCOPE)!.keys()]).toEqual(["obs_unrelated1", "legacy-key"]);
    expect(f.observationLists()).toHaveLength(1);
  });

  it("does not mistake a mismatched record at the requested key for the matching observation", async () => {
    const f = fixture();
    f.data.get(SCOPE)!.set(ID, row("obs_wrong_id1"));
    f.data.get(SCOPE)!.set("legacy-key", row());
    expect(await f.observe()).toMatchObject({ existing: true, observationId: ID });
    expect(indexed.get(ID)).toEqual(row());
    expect(indexed.has("obs_wrong_id1")).toBe(false);
    expect(f.observationLists()).toHaveLength(1);
  });

  it("still reads the session and respects its source budget for a new durable observation", async () => {
    const f = fixture();
    f.data.get(SCOPE)!.delete(ID);
    const largeSource = { hookType: "post_tool_use", originalBytes: SESSION_SOURCE_MAX_BYTES, truncated: false, toolOutput: "s".repeat(SESSION_SOURCE_MAX_BYTES) };
    f.data.get(SCOPE)!.set("obs_unrelated1", { ...row("obs_unrelated1"), source: largeSource });
    expect(await f.observe()).toMatchObject({ observationId: ID });
    expect(f.data.get(SCOPE)!.get(ID)).toMatchObject({ id: ID, sessionId: SESSION });
    expect((f.data.get(SCOPE)!.get(ID) as CompressedObservation).source).toBeUndefined();
    expect((f.data.get(SCOPE)!.get("obs_unrelated1") as CompressedObservation).source).toEqual(largeSource);
    expect(f.observationLists()).toHaveLength(1);
  });

  it("keeps cap eviction and normal writes for a non-durable observation", async () => {
    const f = fixture({ cap: 2 });
    const result = await f.observe(payload({ observationId: undefined }));
    expect(result.observationId).toMatch(/^obs_/);
    expect(result.deduplicated).toBeUndefined();
    expect(f.data.get(SCOPE)!.size).toBe(2);
    expect(f.data.get(SCOPE)!.has(result.observationId as string)).toBe(true);
    expect(f.observationLists()).toHaveLength(1);
    expect(f.calls.some(call => call.function_id === "state::get" && call.payload.scope === SCOPE)).toBe(false);
  });

  it("keeps an invalid observation ID on the existing non-durable path", async () => {
    const f = fixture();
    const result = await f.observe(payload({ observationId: "invalid" }));
    expect(result.observationId).toMatch(/^obs_/);
    expect(result.observationId).not.toBe("invalid");
    expect(result.deduplicated).toBeUndefined();
    expect(f.observationLists()).toHaveLength(1);
    expect(f.calls.some(call => call.function_id === "state::get" && call.payload.scope === SCOPE)).toBe(false);
  });

  it("keeps concurrent durable replays idempotent without full-session reads", async () => {
    const f = fixture();
    const before = structuredClone(f.data);
    expect(await Promise.all(Array.from({ length: 8 }, () => f.observe()))).toEqual(
      Array.from({ length: 8 }, () => ({ observationId: ID, deduplicated: true, existing: true })),
    );
    expect(f.data).toEqual(before);
    expect(indexed.get(ID)).toEqual(row());
    expect(f.observationLists()).toEqual([]);
  });
});

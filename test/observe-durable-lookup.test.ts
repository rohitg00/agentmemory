import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerObserveFunction } from "../src/functions/observe.js";
import { applyUpdateOps, StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, HookPayload } from "../src/types.js";

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

function fixture(options: { rejectPointRead?: boolean } = {}) {
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
        return structuredClone([...entries.values()]);
      }
      if (call.function_id === "state::list_keys") return [...entries.keys()];
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
  const kv = new StateKV(sdk as never);
  registerObserveFunction(sdk as never, kv);
  const observe = (body = payload()) => handlers.get("mem::observe")!(body) as Promise<Record<string, unknown>>;
  const observationLists = () => calls.filter((call) => call.payload.scope === SCOPE && call.function_id === "state::list");
  return { data, observe, observationLists };
}

beforeEach(() => {
  indexed.clear();
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("durable observation lookup", () => {
  it("replays a stored record without listing its session", async () => {
    const f = fixture();
    const before = structuredClone(f.data);
    expect(await f.observe()).toEqual({ observationId: ID, deduplicated: true, existing: true });
    expect(indexed.get(ID)).toEqual(row());
    expect(f.data).toEqual(before);
    expect(f.observationLists()).toEqual([]);
  });

  it("falls back to the session list when the point read fails", async () => {
    const f = fixture({ rejectPointRead: true });
    expect(await f.observe()).toMatchObject({ existing: true, observationId: ID });
    expect(f.observationLists()).toHaveLength(1);
  });

  it("ignores a record with a different id stored at the requested key", async () => {
    const f = fixture();
    f.data.get(SCOPE)!.set(ID, row("obs_wrong_id1"));
    f.data.get(SCOPE)!.set("legacy-key", row());
    expect(await f.observe()).toMatchObject({ existing: true, observationId: ID });
    expect(indexed.has("obs_wrong_id1")).toBe(false);
    expect(f.observationLists()).toHaveLength(1);
  });

  it("writes a new durable observation after one session list", async () => {
    const f = fixture();
    f.data.get(SCOPE)!.delete(ID);
    expect(await f.observe()).toMatchObject({ observationId: ID });
    expect(f.data.get(SCOPE)!.get(ID)).toMatchObject({ id: ID, sessionId: SESSION });
    expect(f.observationLists()).toHaveLength(1);
  });
});

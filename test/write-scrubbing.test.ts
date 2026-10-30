import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  SCRUBBED_WRITE_FUNCTIONS,
  scrubRecord,
  stripPrivateData,
  withWriteScrubbing,
} from "../src/functions/privacy.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerSlotsFunctions } from "../src/functions/slots.js";
import { registerMeshFunction } from "../src/functions/mesh.js";
import { registerCrystallizeFunction } from "../src/functions/crystallize.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import { persistGraphDelta } from "../src/functions/graph.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode } from "../src/types.js";

const DASHES = "-".repeat(5);
const KEY_KIND = ["PRIVATE", "KEY"].join(" ");
const KEY_BODY = "MIIEowIBAAKCAQEAs0m3fakefakefakefakefake";
const PEM = `${DASHES}BEGIN RSA ${KEY_KIND}${DASHES}\n${KEY_BODY}\n${DASHES}END RSA ${KEY_KIND}${DASHES}`;
const OPENSSH_PEM = `${DASHES}BEGIN OPENSSH ${KEY_KIND}${DASHES}\n${KEY_BODY}\n${DASHES}END OPENSSH ${KEY_KIND}${DASHES}`;
const USER_PASS = ["deploy", "hunter2pass"].join(":");
const DB_URL = `postgres://${USER_PASS}@db.internal:5432/app`;
const HTTPS_URL = `https://${USER_PASS}@git.example.com/repo.git`;
const TEXT = `deploy notes ${DB_URL} and ${HTTPS_URL}\n${PEM}\ntrailing`;

function assertClean(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain(KEY_BODY);
  expect(json).not.toContain("hunter2pass");
  expect(json).not.toContain(KEY_KIND);
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
    _store: store,
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction(id: string, handler: Function) {
      fns.set(id, handler);
      return { id };
    },
    registerTrigger: () => {},
    async trigger(input: { function_id: string; payload?: unknown } | string, data?: unknown) {
      const id = typeof input === "string" ? input : input.function_id;
      const payload = typeof input === "string" ? data : input.payload;
      const fn = fns.get(id);
      if (!fn) return { success: true };
      return fn(payload);
    },
    _fns: fns,
  };
}

function allStored(kv: ReturnType<typeof mockKV>): unknown[] {
  const out: unknown[] = [];
  for (const scope of kv._store.values()) out.push(...scope.values());
  return out;
}

describe("stripPrivateData patterns", () => {
  it("redacts PEM private key blocks", () => {
    expect(stripPrivateData(`before\n${PEM}\nafter`)).toBe("before\n[REDACTED_SECRET]\nafter");
    expect(stripPrivateData(OPENSSH_PEM)).toBe("[REDACTED_SECRET]");
  });

  it("redacts a key block that was cut off before its END line", () => {
    const truncated = `${DASHES}BEGIN ${KEY_KIND}${DASHES}\n${KEY_BODY}`;
    expect(stripPrivateData(`x ${truncated}`)).toBe("x [REDACTED_SECRET]");
  });

  it("redacts credentials embedded in URLs and keeps scheme and host", () => {
    const out = stripPrivateData(TEXT);
    expect(out).toContain("postgres://[REDACTED_SECRET]@db.internal:5432/app");
    expect(out).toContain("https://[REDACTED_SECRET]@git.example.com/repo.git");
    assertClean(out);
  });

  it("redacts URL passwords that have an empty username", () => {
    const out = stripPrivateData("cache at redis://:hunter2pass@cache.internal:6379/0");
    expect(out).toBe("cache at redis://[REDACTED_SECRET]@cache.internal:6379/0");
  });

  it("leaves ordinary URLs untouched", () => {
    const plain = "see https://example.com/a?b=c and mailto:me@example.com";
    expect(stripPrivateData(plain)).toBe(plain);
  });

  it("scrubRecord walks nested objects and arrays without touching other types", () => {
    const out = scrubRecord({ a: [TEXT, { b: TEXT }], n: 3, ok: true, none: null });
    assertClean(out);
    expect(out.n).toBe(3);
    expect(out.ok).toBe(true);
    expect(out.none).toBeNull();
  });
});

describe("withWriteScrubbing", () => {
  it("scrubs the payload of every listed write function before the handler runs", async () => {
    const sdk = withWriteScrubbing(mockSdk());
    const seen = new Map<string, unknown>();
    for (const id of SCRUBBED_WRITE_FUNCTIONS) {
      sdk.registerFunction(id, async (data: unknown) => {
        seen.set(id, data);
      });
    }
    for (const id of SCRUBBED_WRITE_FUNCTIONS) {
      await sdk.trigger({ function_id: id, payload: { content: TEXT, nested: { list: [TEXT] } } });
      assertClean(seen.get(id));
    }
    expect(seen.size).toBe(SCRUBBED_WRITE_FUNCTIONS.size);
  });

  it("leaves read functions alone", async () => {
    const sdk = withWriteScrubbing(mockSdk());
    let seen: unknown;
    sdk.registerFunction("mem::search", async (data: unknown) => {
      seen = data;
    });
    await sdk.trigger({ function_id: "mem::search", payload: { query: TEXT } });
    expect(seen).toEqual({ query: TEXT });
  });

  it("covers remember, evolve, slots, lessons, actions, imports and mesh", () => {
    for (const id of [
      "mem::remember",
      "mem::evolve",
      "mem::slot-create",
      "mem::slot-append",
      "mem::slot-replace",
      "mem::lesson-save",
      "mem::action-create",
      "mem::action-update",
      "mem::import",
      "mem::mesh-receive",
    ]) {
      expect(SCRUBBED_WRITE_FUNCTIONS.has(id)).toBe(true);
    }
  });
});

describe("write paths store scrubbed text", () => {
  const savedSlots = process.env.AGENTMEMORY_SLOTS;

  afterEach(() => {
    if (savedSlots === undefined) delete process.env.AGENTMEMORY_SLOTS;
    else process.env.AGENTMEMORY_SLOTS = savedSlots;
  });

  it("mem::remember", async () => {
    const kv = mockKV();
    const sdk = withWriteScrubbing(mockSdk());
    registerRememberFunction(sdk as never, kv as never);
    await sdk.trigger({ function_id: "mem::remember", payload: { content: TEXT, project: "p" } });
    const memories = await kv.list(KV.memories);
    expect(memories.length).toBe(1);
    assertClean(memories);
  });

  it("mem::lesson-save", async () => {
    const kv = mockKV();
    const sdk = withWriteScrubbing(mockSdk());
    registerLessonsFunctions(sdk as never, kv as never);
    await sdk.trigger({ function_id: "mem::lesson-save", payload: { content: TEXT, context: TEXT, project: "p" } });
    const lessons = await kv.list(KV.lessons);
    expect(lessons.length).toBe(1);
    assertClean(lessons);
  });

  it("mem::slot-create and mem::slot-append", async () => {
    process.env.AGENTMEMORY_SLOTS = "true";
    const kv = mockKV();
    const sdk = withWriteScrubbing(mockSdk());
    registerSlotsFunctions(sdk as never, kv as never);
    await sdk.trigger({ function_id: "mem::slot-create", payload: { label: "notes_x", content: TEXT, scope: "global" } });
    await sdk.trigger({ function_id: "mem::slot-append", payload: { label: "notes_x", text: TEXT, content: TEXT } });
    const slots = [...(await kv.list(KV.slots)), ...(await kv.list(KV.globalSlots))];
    expect(slots.length).toBeGreaterThan(0);
    assertClean(slots);
  });

  it("mem::mesh-receive", async () => {
    const kv = mockKV();
    const sdk = withWriteScrubbing(mockSdk());
    registerMeshFunction(sdk as never, kv as never);
    const now = new Date().toISOString();
    await sdk.trigger({
      function_id: "mem::mesh-receive",
      payload: {
        memories: [{ id: "mem_mesh", title: "t", content: TEXT, type: "fact", createdAt: now, updatedAt: now, isLatest: true }],
      },
    });
    assertClean(allStored(kv));
    expect(await kv.get(KV.memories, "mem_mesh")).not.toBeNull();
  });

  it("crystal narratives produced by the provider", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    const summarize = vi.fn().mockResolvedValue(
      JSON.stringify({ narrative: TEXT, keyOutcomes: [TEXT], filesAffected: ["a.ts"], lessons: [] }),
    );
    registerCrystallizeFunction(sdk as never, kv as never, { name: "t", compress: vi.fn(), summarize } as never);
    const now = new Date().toISOString();
    await kv.set(KV.actions, "act_1", {
      id: "act_1", title: "t", description: "d", status: "done", priority: 5,
      createdAt: now, updatedAt: now, createdBy: "a", tags: [], sourceObservationIds: [], sourceMemoryIds: [],
    });
    const result = (await sdk.trigger({ function_id: "mem::crystallize", payload: { actionIds: ["act_1"] } })) as { success: boolean };
    expect(result.success).toBe(true);
    assertClean(await kv.list(KV.crystals));
  });

  it("crystal metadata supplied by the caller", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    const summarize = vi.fn().mockResolvedValue(
      JSON.stringify({ narrative: "n", keyOutcomes: [], filesAffected: [], lessons: [] }),
    );
    registerCrystallizeFunction(sdk as never, kv as never, { name: "t", compress: vi.fn(), summarize } as never);
    const now = new Date().toISOString();
    await kv.set(KV.actions, "act_2", {
      id: "act_2", title: "t", description: "d", status: "done", priority: 5,
      createdAt: now, updatedAt: now, createdBy: "a", tags: [], sourceObservationIds: [], sourceMemoryIds: [],
    });
    const result = (await sdk.trigger({
      function_id: "mem::crystallize",
      payload: { actionIds: ["act_2"], project: HTTPS_URL, sessionId: DB_URL },
    })) as { success: boolean };
    expect(result.success).toBe(true);
    const crystals = await kv.list<{ project?: string }>(KV.crystals);
    expect(crystals[0]?.project).toBe("https://[REDACTED_SECRET]@git.example.com/repo.git");
    assertClean(crystals);
  });

  it("graph node properties", async () => {
    const kv = mockKV();
    const now = new Date().toISOString();
    const node = {
      id: "gn_1",
      type: "concept",
      name: "deploy",
      properties: { note: TEXT },
      sourceObservationIds: [],
      createdAt: now,
    } as unknown as GraphNode;
    await persistGraphDelta(kv as never, [node], []);
    assertClean(await kv.list(KV.graphNodes));
  });

  describe("jsonl replay", () => {
    let dir: string;
    const savedRoot = process.env.AGENTMEMORY_IMPORT_ROOT;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "am-scrub-replay-"));
      process.env.AGENTMEMORY_IMPORT_ROOT = dir;
    });

    afterEach(() => {
      if (savedRoot === undefined) delete process.env.AGENTMEMORY_IMPORT_ROOT;
      else process.env.AGENTMEMORY_IMPORT_ROOT = savedRoot;
      rmSync(dir, { recursive: true, force: true });
    });

    it("stores scrubbed observations, sessions and derived records", async () => {
      const ts = "2026-04-17T10:00:00.000Z";
      mkdirSync(join(dir, "proj"), { recursive: true });
      const lines = [
        { type: "user", uuid: "u1", sessionId: "sess-scrub", timestamp: ts, cwd: dir, message: { role: "user", content: [{ type: "text", text: TEXT }] } },
        { type: "assistant", uuid: "a1", sessionId: "sess-scrub", timestamp: ts, message: { role: "assistant", content: [{ type: "text", text: TEXT }] } },
      ];
      writeFileSync(join(dir, "proj", "sess-scrub.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      const kv = mockKV();
      const sdk = mockSdk();
      registerReplayFunctions(sdk as never, kv as never);
      const result = (await sdk.trigger({ function_id: "mem::replay::import-jsonl", payload: { path: dir } })) as { success: boolean; observations: number };
      expect(result.success).toBe(true);
      expect(result.observations).toBeGreaterThan(0);
      assertClean(allStored(kv));
    });
  });
});

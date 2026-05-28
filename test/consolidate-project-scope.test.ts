import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

import { registerConsolidateFunction } from "../src/functions/consolidate.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Memory, MemoryProvider, Session } from "../src/types.js";

function makeMockKV() {
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

function makeMockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : (idOrInput as { payload: unknown }).payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function makeProvider(title = "synthesized memory title"): MemoryProvider {
  return {
    name: "mock",
    compress: vi.fn().mockResolvedValue(
      `<memory>
        <type>pattern</type>
        <title>${title}</title>
        <content>synthesized content about the concept</content>
        <concepts><concept>auth</concept></concepts>
        <files><file>src/auth.ts</file></files>
        <strength>7</strength>
      </memory>`,
    ),
    embed: vi.fn().mockResolvedValue(new Float32Array(384)),
    embedBatch: vi.fn().mockResolvedValue([]),
    dimensions: 384,
    compressionModel: "mock-model",
  };
}

function makeSession(id: string, project: string): Session {
  return {
    id,
    project,
    cwd: `/srv/${project}`,
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: 5,
  };
}

function makeObs(id: string, sessionId: string, concept: string): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    type: "decision",
    title: `${concept} observation ${id}`,
    facts: [`fact about ${concept}`],
    narrative: `detailed narrative about ${concept} pattern usage`,
    concepts: [concept],
    files: ["src/auth.ts"],
    importance: 8,
  };
}

function makeExistingMemory(id: string, title: string, project?: string): Memory {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "pattern",
    title,
    content: "existing content",
    concepts: ["auth"],
    files: ["src/auth.ts"],
    sessionIds: [],
    strength: 6,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

describe("mem::consolidate — cross-project existingMatch guard", () => {
  it("does not evolve a memory from a different project even when titles match", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider = makeProvider("synthesized memory title");

    // A memory scoped to "web" with the same title the provider will generate
    const webMemory = makeExistingMemory("mem_web", "synthesized memory title", "web");
    await kv.set(KV.memories, webMemory.id, webMemory);

    // Session and observations for "api" project
    const apiSession = makeSession("sess_api", "api");
    await kv.set(KV.sessions, apiSession.id, apiSession);
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(apiSession.id),
        `obs_${i}`,
        makeObs(`obs_${i}`, apiSession.id, "auth"),
      );
    }

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    await sdk.trigger("mem::consolidate", { project: "api", minObservations: 1 });

    // The web memory must remain untouched — isLatest still true
    const webStored = await kv.get<Memory>(KV.memories, webMemory.id);
    expect(webStored?.isLatest).toBe(true);
    expect(webStored?.project).toBe("web");

    // A new "api" memory should have been created
    const allMemories = await kv.list<Memory>(KV.memories);
    const apiMemories = allMemories.filter((m) => m.project === "api" && m.isLatest);
    expect(apiMemories).toHaveLength(1);
    expect(apiMemories[0].title).toBe("synthesized memory title");
  });

  it("evolves an existing memory within the same project when titles match", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider = makeProvider("synthesized memory title");

    // A memory already scoped to "api" with the same title
    const apiMemory = makeExistingMemory("mem_api_old", "synthesized memory title", "api");
    await kv.set(KV.memories, apiMemory.id, apiMemory);

    const apiSession = makeSession("sess_api", "api");
    await kv.set(KV.sessions, apiSession.id, apiSession);
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(apiSession.id),
        `obs_${i}`,
        makeObs(`obs_${i}`, apiSession.id, "auth"),
      );
    }

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    await sdk.trigger("mem::consolidate", { project: "api", minObservations: 1 });

    // The old api memory should have been marked non-latest (evolved)
    const oldMemory = await kv.get<Memory>(KV.memories, apiMemory.id);
    expect(oldMemory?.isLatest).toBe(false);

    // A new evolved memory should exist
    const allMemories = await kv.list<Memory>(KV.memories);
    const latestApi = allMemories.filter((m) => m.project === "api" && m.isLatest);
    expect(latestApi).toHaveLength(1);
    expect(latestApi[0].id).not.toBe(apiMemory.id);
    expect(latestApi[0].parentId).toBe(apiMemory.id);
  });

  it("unscoped consolidation may evolve any existing memory regardless of project (background cron behavior)", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider = makeProvider("synthesized memory title");

    // A scoped memory that an unscoped consolidation run should be able to evolve
    const scopedMemory = makeExistingMemory("mem_api_old", "synthesized memory title", "api");
    await kv.set(KV.memories, scopedMemory.id, scopedMemory);

    // Session with no project restriction — unscoped consolidation
    const session = makeSession("sess_any", "any");
    await kv.set(KV.sessions, session.id, session);
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(session.id),
        `obs_${i}`,
        makeObs(`obs_${i}`, session.id, "auth"),
      );
    }

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    // No project passed — unscoped consolidation
    await sdk.trigger("mem::consolidate", { minObservations: 1 });

    // The existing scoped memory should have been evolved (unscoped run is unrestricted)
    const old = await kv.get<Memory>(KV.memories, scopedMemory.id);
    expect(old?.isLatest).toBe(false);

    // The evolved successor should be latest and carry no project (unscoped run)
    const allMemories = await kv.list<Memory>(KV.memories);
    const successor = allMemories.find((m) => m.isLatest && m.id !== scopedMemory.id);
    expect(successor).toBeDefined();
    expect(successor?.isLatest).toBe(true);
    expect(successor?.project).toBeUndefined();
  });

  it("stamps the correct project on newly created memories", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider = makeProvider("brand new memory");

    const session = makeSession("sess_api", "api");
    await kv.set(KV.sessions, session.id, session);
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(session.id),
        `obs_${i}`,
        makeObs(`obs_${i}`, session.id, "auth"),
      );
    }

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    await sdk.trigger("mem::consolidate", { project: "api", minObservations: 1 });

    const memories = await kv.list<Memory>(KV.memories);
    expect(memories).toHaveLength(1);
    expect(memories[0].project).toBe("api");
  });

  it("leaves project undefined on memories when consolidate is called without a project", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    const provider = makeProvider("unscoped memory");

    const session = makeSession("sess_any", "any");
    await kv.set(KV.sessions, session.id, session);
    for (let i = 0; i < 3; i++) {
      await kv.set(
        KV.observations(session.id),
        `obs_${i}`,
        makeObs(`obs_${i}`, session.id, "auth"),
      );
    }

    registerConsolidateFunction(sdk as never, kv as never, provider as never);
    await sdk.trigger("mem::consolidate", { minObservations: 1 });

    const memories = await kv.list<Memory>(KV.memories);
    expect(memories).toHaveLength(1);
    expect(memories[0].project).toBeUndefined();
  });
});

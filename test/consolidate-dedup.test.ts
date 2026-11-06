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

function makeKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

function makeSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => functions.set(id, handler),
    registerTrigger: () => {},
    trigger: async (id: string, payload: unknown) => functions.get(id)!(payload),
  };
}

function memoryXml(title: string): string {
  return `<memory><type>pattern</type><title>${title}</title><content>content for ${title}</content><concepts><concept>auth</concept></concepts><files><file>src/auth.ts</file></files><strength>7</strength></memory>`;
}

function providerReturning(...titles: string[]): MemoryProvider & { compress: ReturnType<typeof vi.fn> } {
  const compress = vi.fn();
  for (const t of titles) compress.mockResolvedValueOnce(memoryXml(t));
  return { name: "mock", compress, summarize: vi.fn() } as never;
}

function obs(id: string, concept: string, importance = 8): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "decision",
    title: `${concept} observation ${id}`,
    facts: [],
    narrative: `narrative ${id}`,
    concepts: [concept],
    files: ["src/auth.ts"],
    importance,
  };
}

async function seed(kv: ReturnType<typeof makeKV>, observations: CompressedObservation[]) {
  const session: Session = {
    id: "ses_1",
    project: "app",
    cwd: "/srv/app",
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: observations.length,
  };
  await kv.set(KV.sessions, session.id, session);
  for (const o of observations) await kv.set(KV.observations(session.id), o.id, o);
}

const latest = async (kv: ReturnType<typeof makeKV>) =>
  (await kv.list<Memory>(KV.memories)).filter((m) => m.isLatest !== false);

describe("mem::consolidate duplicate prevention", () => {
  it("skips groups whose observations already produced a memory, with no LLM call", async () => {
    const kv = makeKV();
    const sdk = makeSdk();
    await seed(kv, [obs("o0", "auth"), obs("o1", "auth"), obs("o2", "auth")]);
    const provider = providerReturning("Token validation", "Reworded token validation");
    registerConsolidateFunction(sdk as never, kv as never, provider);

    const first = (await sdk.trigger("mem::consolidate", { minObservations: 1 })) as { consolidated: number };
    const second = (await sdk.trigger("mem::consolidate", { minObservations: 1 })) as {
      consolidated: number;
      skipped: number;
    };

    expect(first.consolidated).toBe(1);
    expect(second).toMatchObject({ consolidated: 0, skipped: 1 });
    expect(provider.compress).toHaveBeenCalledTimes(1);
    expect(await kv.list<Memory>(KV.memories)).toHaveLength(1);
  });

  it("evolves the memory built from overlapping observations when the LLM picks a new title", async () => {
    const kv = makeKV();
    const sdk = makeSdk();
    await seed(kv, [obs("o0", "auth"), obs("o1", "auth"), obs("o2", "auth")]);
    const provider = providerReturning("Token validation", "Validating auth tokens");
    registerConsolidateFunction(sdk as never, kv as never, provider);

    await sdk.trigger("mem::consolidate", { minObservations: 1 });
    const [original] = await latest(kv);
    await kv.set(KV.observations("ses_1"), "o3", obs("o3", "auth", 9));
    await sdk.trigger("mem::consolidate", { minObservations: 1 });

    const current = await latest(kv);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ title: "Validating auth tokens", version: 2, parentId: original!.id });
    expect((await kv.get<Memory>(KV.memories, original!.id))?.isLatest).toBe(false);
  });

  it("does not create two memories with one title in a single run", async () => {
    const kv = makeKV();
    const sdk = makeSdk();
    await seed(kv, [
      obs("a0", "auth"), obs("a1", "auth"), obs("a2", "auth"),
      obs("j0", "jwt"), obs("j1", "jwt"), obs("j2", "jwt"),
    ]);
    const provider = providerReturning("Token handling", "Token handling");
    registerConsolidateFunction(sdk as never, kv as never, provider);

    await sdk.trigger("mem::consolidate", { minObservations: 1 });

    const titled = (await latest(kv)).filter((m) => m.title === "Token handling");
    expect(titled).toHaveLength(1);
    expect(titled[0]!.version).toBe(2);
  });
});

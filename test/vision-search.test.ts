import { describe, it, expect, beforeEach, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { registerVisionSearchFunctions } from "../src/functions/vision-search.js";
import type { EmbeddingProvider } from "../src/types.js";
import { KV } from "../src/state/schema.js";

const IMAGES_DIR = join(homedir(), ".agentmemory", "images");
const LOGIN_REF = join(IMAGES_DIR, "login.png");
const DASH_REF = join(IMAGES_DIR, "dashboard.png");
const OTHER_REF = join(IMAGES_DIR, "other.png");

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

function unit(v: number[]): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  return new Float32Array(v.map((x) => x / (norm || 1)));
}

describe("vision-search", () => {
  let visionSearch: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  let visionEmbed: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  let kv: ReturnType<typeof mockKV>;

  const fakeProvider: EmbeddingProvider = {
    name: "fake-clip",
    dimensions: 3,
    embed: async (text: string) => {
      if (text.includes("login")) return unit([1, 0, 0]);
      if (text.includes("dashboard")) return unit([0, 1, 0]);
      return unit([0, 0, 1]);
    },
    embedBatch: async (texts: string[]) => Promise.all(texts.map((t) => fakeProvider.embed(t))),
    embedImage: async (ref: string) => {
      if (ref.endsWith("login.png")) return unit([1, 0.1, 0]);
      if (ref.endsWith("dashboard.png")) return unit([0, 1, 0.1]);
      return unit([0, 0.1, 1]);
    },
  };

  async function seedRef(ref: string): Promise<void> {
    await kv.set(KV.imageRefs, ref, 1);
  }

  beforeEach(() => {
    kv = mockKV();
    const handlers: Record<string, (data: Record<string, unknown>) => Promise<Record<string, unknown>>> = {};
    const sdk = {
      registerFunction: vi.fn((id: string, cb) => {
        handlers[id] = cb;
      }),
    } as unknown as import("iii-sdk").ISdk;
    registerVisionSearchFunctions(sdk, kv as never, fakeProvider);
    visionSearch = handlers["mem::vision-search"]!;
    visionEmbed = handlers["mem::vision-embed"]!;
  });

  it("embeds and stores image vectors in KV.imageEmbeddings", async () => {
    await seedRef(LOGIN_REF);
    const res = (await visionEmbed({ imageRef: LOGIN_REF })) as { success: boolean; dimensions: number };
    expect(res.success).toBe(true);
    expect(res.dimensions).toBe(3);
    const stored = await kv.list(KV.imageEmbeddings);
    expect(stored.length).toBe(1);
  });

  it("rejects imageRef outside the managed image store", async () => {
    const res = (await visionEmbed({ imageRef: "/etc/passwd" })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/managed/);
  });

  it("rejects imageRef not registered in mem:image-refs", async () => {
    const res = (await visionEmbed({ imageRef: LOGIN_REF })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not registered/);
  });

  it("text query ranks the matching image first", async () => {
    for (const r of [LOGIN_REF, DASH_REF, OTHER_REF]) await seedRef(r);
    await visionEmbed({ imageRef: LOGIN_REF });
    await visionEmbed({ imageRef: DASH_REF });
    await visionEmbed({ imageRef: OTHER_REF });

    const res = (await visionSearch({ queryText: "the login form", topK: 3 })) as {
      success: boolean;
      results: Array<{ imageRef: string; score: number }>;
    };
    expect(res.success).toBe(true);
    expect(res.results[0].imageRef).toBe(LOGIN_REF);
    expect(res.results[0].score).toBeGreaterThan(res.results[1].score);
  });

  it("image-to-image query finds the same image first", async () => {
    await seedRef(LOGIN_REF);
    await seedRef(DASH_REF);
    await visionEmbed({ imageRef: LOGIN_REF });
    await visionEmbed({ imageRef: DASH_REF });

    const res = (await visionSearch({ queryImageRef: LOGIN_REF, topK: 2 })) as {
      success: boolean;
      results: Array<{ imageRef: string; score: number }>;
    };
    expect(res.results[0].imageRef).toBe(LOGIN_REF);
    expect(res.results[0].score).toBeGreaterThan(0.9);
  });

  it("queryImageRef outside managed store is rejected", async () => {
    const res = (await visionSearch({ queryImageRef: "/etc/passwd" })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/managed/);
  });

  it("accepts `limit` as an alias for topK", async () => {
    for (const r of [LOGIN_REF, DASH_REF, OTHER_REF]) await seedRef(r);
    await visionEmbed({ imageRef: LOGIN_REF });
    await visionEmbed({ imageRef: DASH_REF });
    await visionEmbed({ imageRef: OTHER_REF });

    const res = (await visionSearch({ queryText: "the login form", limit: 2 })) as {
      success: boolean;
      results: Array<{ imageRef: string }>;
    };
    expect(res.success).toBe(true);
    expect(res.results).toHaveLength(2);
  });

  it("prefers topK when both topK and limit are given", async () => {
    for (const r of [LOGIN_REF, DASH_REF, OTHER_REF]) await seedRef(r);
    await visionEmbed({ imageRef: LOGIN_REF });
    await visionEmbed({ imageRef: DASH_REF });
    await visionEmbed({ imageRef: OTHER_REF });

    const res = (await visionSearch({ queryText: "the login form", topK: 1, limit: 3 })) as {
      results: Array<{ imageRef: string }>;
    };
    expect(res.results).toHaveLength(1);
  });

  it("sessionId filters out embeddings from other sessions", async () => {
    await seedRef(LOGIN_REF);
    await seedRef(DASH_REF);
    await visionEmbed({ imageRef: LOGIN_REF, sessionId: "sess_a" });
    await visionEmbed({ imageRef: DASH_REF, sessionId: "sess_b" });

    const res = (await visionSearch({ queryText: "anything", sessionId: "sess_a", topK: 5 })) as {
      success: boolean;
      results: Array<{ sessionId?: string }>;
    };
    expect(res.results.every((r) => r.sessionId === "sess_a")).toBe(true);
    expect(res.results.length).toBe(1);
  });

  it("clamps NaN/fractional topK to a valid integer", async () => {
    await seedRef(LOGIN_REF);
    await visionEmbed({ imageRef: LOGIN_REF });
    const resNan = (await visionSearch({ queryText: "x", topK: Number.NaN })) as {
      success: boolean;
      results: unknown[];
    };
    expect(resNan.success).toBe(true);
    expect(resNan.results.length).toBe(1);
    const resFrac = (await visionSearch({ queryText: "x", topK: 3.7 })) as { success: boolean; results: unknown[] };
    expect(resFrac.success).toBe(true);
    expect(resFrac.results.length).toBe(1);
  });

  it("returns 503-equivalent error when provider is absent", async () => {
    const handlers: Record<string, (data: Record<string, unknown>) => Promise<Record<string, unknown>>> = {};
    const sdk = {
      registerFunction: vi.fn((id: string, cb) => {
        handlers[id] = cb;
      }),
    } as unknown as import("iii-sdk").ISdk;
    registerVisionSearchFunctions(sdk, kv as never, null);
    const res = (await handlers["mem::vision-search"]!({ queryText: "login" })) as {
      success: boolean;
      error: string;
    };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/disabled/);
  });

  it("rejects missing query", async () => {
    const res = (await visionSearch({})) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/required/);
  });
});

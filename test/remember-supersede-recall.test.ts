import { describe, it, expect, vi, beforeEach } from "vitest";
import { KV } from "../src/state/schema.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function setup() {
  vi.resetModules();
  const search = await import("../src/functions/search.js");
  const { registerRememberFunction } = await import("../src/functions/remember.js");
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  registerRememberFunction(sdk as never, kv as never);
  return { sdk, kv, search };
}

describe("mem::remember supersession and recall hygiene", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("removes the superseded version from the search index", async () => {
    const { sdk, search } = await setup();
    const first = (await sdk.trigger("mem::remember", {
      content: "the deploy pipeline uses blue green rollout with health gates",
      type: "architecture",
    })) as { memory: { id: string } };
    const idx = search.getSearchIndex();
    expect(idx.has(first.memory.id)).toBe(true);

    const second = (await sdk.trigger("mem::remember", {
      content: "the deploy pipeline uses blue green rollout with health gates always",
      type: "architecture",
    })) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);
    expect(idx.has(first.memory.id)).toBe(false);
    expect(idx.has(second.memory.id)).toBe(true);
  });

  it("reports a close-but-below-threshold match as similarTo without superseding", async () => {
    const { sdk } = await setup();
    const first = (await sdk.trigger("mem::remember", {
      content: "redis cache layer fronting the primary database for hot reads",
      type: "architecture",
    })) as { memory: { id: string } };

    const second = (await sdk.trigger("mem::remember", {
      content: "redis cache layer fronting the primary database misses cold writes entirely",
      type: "architecture",
    })) as {
      memory: { id: string; version: number };
      similarTo?: { id: string; similarity: number };
    };

    expect(second.memory.version).toBe(1);
    expect(second.similarTo).toBeDefined();
    expect(second.similarTo!.id).toBe(first.memory.id);
    expect(second.similarTo!.similarity).toBeGreaterThan(0.4);
    expect(second.similarTo!.similarity).toBeLessThanOrEqual(0.7);
  });

  it("still finds the supersession target through index-backed candidates", async () => {
    const { sdk } = await setup();
    for (let i = 0; i < 30; i++) {
      await sdk.trigger("mem::remember", {
        content: `unrelated filler memory number ${i} about topic-${i} with words w${i}a w${i}b`,
        type: "fact",
      });
    }
    const target = (await sdk.trigger("mem::remember", {
      content: "session tokens rotate every fifteen minutes via the auth broker",
      type: "workflow",
    })) as { memory: { id: string } };

    const update = (await sdk.trigger("mem::remember", {
      content: "session tokens rotate every fifteen minutes via the auth broker service",
      type: "workflow",
    })) as { memory: { supersedes: string[]; version: number } };

    expect(update.memory.supersedes).toContain(target.memory.id);
    expect(update.memory.version).toBe(2);
  });
  it.each([["alpha", "beta"], ["alpha", undefined], [undefined, "alpha"]])("does not supersede or suggest memories across agent scopes (%s, %s)", async (firstAgent, secondAgent) => {
    const { sdk, kv, search } = await setup();
    const content = "redis cache layer fronting the primary database for hot reads";
    const first = await sdk.trigger("mem::remember", { content, project: "shared", agentId: firstAgent }) as any;
    const duplicate = await sdk.trigger("mem::remember", { content, project: "shared", agentId: secondAgent }) as any;
    const near = await sdk.trigger("mem::remember", { content: "redis cache layer fronting the primary database misses cold writes entirely", project: "shared", agentId: secondAgent }) as any;
    expect(duplicate.memory.supersedes).toEqual([]);
    expect(duplicate.similarTo).toBeUndefined();
    expect(near.similarTo?.id).not.toBe(first.memory.id);
    expect((await kv.get(KV.memories, first.memory.id))?.isLatest).not.toBe(false);
    expect(search.getSearchIndex().has(first.memory.id)).toBe(true);
    const own = await sdk.trigger("mem::remember", { content, project: "shared", agentId: firstAgent }) as any;
    expect(own.memory.supersedes).toContain(first.memory.id);
  });

});

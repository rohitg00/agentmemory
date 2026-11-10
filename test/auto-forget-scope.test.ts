import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/image-refs.js", () => ({
  decrementImageRef: vi.fn(async () => {}),
}));

import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import { registerRetentionFunctions } from "../src/functions/retention.js";
import { decrementImageRef } from "../src/functions/image-refs.js";
import { singleFlight } from "../src/functions/status.js";
import { sharesMemoryScope } from "../src/state/memory-utils.js";
import {
  AUTO_FORGET_INTERVAL_DEFAULT_MS,
  getAutoForgetIntervalMs,
} from "../src/config.js";
import { logger } from "../src/logger.js";
import type { Memory } from "../src/types.js";

function mockKV(failDeleteScope?: string) {
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
      if (scope === failDeleteScope) throw new Error("delete failed");
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const SHARED = "Always run the full test suite before pushing any commit";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    type: "pattern",
    title: "Test memory",
    content: SHARED,
    concepts: ["workflow"],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

async function runContradictions(older: Partial<Memory>, newer: Partial<Memory>) {
  const sdk = mockSdk();
  const kv = mockKV();
  registerAutoForgetFunction(sdk as never, kv as never);
  await kv.set("mem:memories", "mem_old", makeMemory({ id: "mem_old", ...older }));
  await kv.set(
    "mem:memories",
    "mem_new",
    makeMemory({ id: "mem_new", createdAt: "2026-02-01T00:00:00Z", ...newer }),
  );
  const result = (await sdk.trigger("mem::auto-forget", {})) as {
    contradictions: unknown[];
  };
  const old = await kv.get<Memory>("mem:memories", "mem_old");
  return { contradictions: result.contradictions.length, oldIsLatest: old!.isLatest };
}

describe("auto-forget contradiction scope", () => {
  it("keeps near-identical memories in different projects", async () => {
    const r = await runContradictions({ project: "alpha" }, { project: "beta" });
    expect(r.contradictions).toBe(0);
    expect(r.oldIsLatest).toBe(true);
  });

  it("keeps near-identical memories owned by different agents", async () => {
    const r = await runContradictions({ agentId: "agent-a" }, { agentId: "agent-b" });
    expect(r.contradictions).toBe(0);
    expect(r.oldIsLatest).toBe(true);
  });

  it("keeps an agent-scoped memory next to an unowned one", async () => {
    const r = await runContradictions({ agentId: "agent-a" }, {});
    expect(r.contradictions).toBe(0);
    expect(r.oldIsLatest).toBe(true);
  });

  it("supersedes the older memory within the same project and agent", async () => {
    const r = await runContradictions(
      { project: "alpha", agentId: "agent-a" },
      { project: "alpha", agentId: "agent-a" },
    );
    expect(r.contradictions).toBe(1);
    expect(r.oldIsLatest).toBe(false);
  });

  it("treats an unscoped legacy memory as a project wildcard", async () => {
    const r = await runContradictions({}, { project: "alpha" });
    expect(r.contradictions).toBe(1);
    expect(r.oldIsLatest).toBe(false);
  });
});

describe("sharesMemoryScope", () => {
  it("matches the rule used by remember and auto-forget", () => {
    expect(sharesMemoryScope({}, {})).toBe(true);
    expect(sharesMemoryScope({ project: "a" }, {})).toBe(true);
    expect(sharesMemoryScope({ project: "a" }, { project: "b" })).toBe(false);
    expect(sharesMemoryScope({ agentId: "x" }, { agentId: "x" })).toBe(true);
    expect(sharesMemoryScope({ agentId: "x" }, {})).toBe(false);
    expect(sharesMemoryScope({ agentId: "" }, {})).toBe(true);
  });
});

describe("getAutoForgetIntervalMs", () => {
  const original = process.env.AUTO_FORGET_INTERVAL_MS;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    if (original === undefined) delete process.env.AUTO_FORGET_INTERVAL_MS;
    else process.env.AUTO_FORGET_INTERVAL_MS = original;
  });

  it("accepts a valid millisecond value", () => {
    process.env.AUTO_FORGET_INTERVAL_MS = "900000";
    expect(getAutoForgetIntervalMs()).toBe(900000);
    expect(stderr).not.toHaveBeenCalled();
  });

  it.each(["1h", "60m", "abc", "0", "-5", "59999"])(
    "falls back to the default with a warning for %s",
    (value) => {
      process.env.AUTO_FORGET_INTERVAL_MS = value;
      expect(getAutoForgetIntervalMs()).toBe(AUTO_FORGET_INTERVAL_DEFAULT_MS);
      expect(stderr).toHaveBeenCalledTimes(1);
    },
  );
});

describe("auto-forget timer overlap", () => {
  it("does not start a second run while the first is in flight", async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const tick = singleFlight(run, 0);
    const first = tick();
    const second = tick();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    await Promise.resolve();
    void tick();
    expect(run).toHaveBeenCalledTimes(2);
    release();
  });
});

describe("image refs are released only after the memory delete succeeds", () => {
  beforeEach(() => {
    vi.mocked(decrementImageRef).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  it("auto-forget TTL keeps the image ref when the delete fails", async () => {
    const sdk = mockSdk();
    const kv = mockKV("mem:memories");
    registerAutoForgetFunction(sdk as never, kv as never);
    await kv.set(
      "mem:memories",
      "mem_img",
      makeMemory({ id: "mem_img", forgetAfter: "2020-01-01T00:00:00Z", imageRef: "/tmp/img.png" }),
    );
    await expect(sdk.trigger("mem::auto-forget", {})).rejects.toThrow("delete failed");
    expect(decrementImageRef).not.toHaveBeenCalled();
    expect(await kv.get("mem:memories", "mem_img")).not.toBeNull();
  });

  it("auto-forget TTL releases the image ref after a successful delete", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerAutoForgetFunction(sdk as never, kv as never);
    await kv.set(
      "mem:memories",
      "mem_img",
      makeMemory({ id: "mem_img", forgetAfter: "2020-01-01T00:00:00Z", imageRef: "/tmp/img.png" }),
    );
    await sdk.trigger("mem::auto-forget", {});
    expect(decrementImageRef).toHaveBeenCalledTimes(1);
    expect(await kv.get("mem:memories", "mem_img")).toBeNull();
  });

  it("retention eviction keeps the image ref and logs when the delete fails", async () => {
    const sdk = mockSdk();
    const kv = mockKV("mem:memories");
    registerRetentionFunctions(sdk as never, kv as never);
    const created = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString();
    await kv.set(
      "mem:memories",
      "mem_img",
      makeMemory({
        id: "mem_img",
        type: "fact",
        createdAt: created,
        updatedAt: created,
        strength: 1,
        imageRef: "/tmp/img.png",
      }),
    );
    await sdk.trigger({ function_id: "mem::retention-score", payload: {} });
    const result = (await sdk.trigger({
      function_id: "mem::retention-evict",
      payload: { threshold: 1, dryRun: false },
    })) as { evicted: number };
    expect(result.evicted).toBe(0);
    expect(decrementImageRef).not.toHaveBeenCalled();
    expect(await kv.get("mem:memories", "mem_img")).not.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "Retention delete failed",
      expect.objectContaining({ id: "mem_img" }),
    );
  });
});

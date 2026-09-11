import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerSlotsFunctions,
  DEFAULT_SLOTS,
  listPinnedSlots,
  renderPinnedContext,
  truncateAtLineBoundaryFromEnd,
  truncateAtLineBoundaryFromStart,
} from "../src/functions/slots.js";
import { KV } from "../src/state/schema.js";

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

function wire() {
  const kv = mockKV();
  const handlers: Record<string, (data: Record<string, unknown>) => Promise<Record<string, unknown>>> = {};
  const sdk = {
    registerFunction: vi.fn((id: string, cb) => {
      handlers[id] = cb;
    }),
  } as unknown as import("iii-sdk").ISdk;
  registerSlotsFunctions(sdk, kv as never);
  return { kv, handlers };
}

async function waitForSeed(kv: ReturnType<typeof mockKV>) {
  for (let i = 0; i < 20; i++) {
    const p = await kv.list(KV.slots);
    const g = await kv.list(KV.globalSlots);
    if (p.length + g.length >= DEFAULT_SLOTS.length) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("slots — primitive", () => {
  let kv: ReturnType<typeof mockKV>;
  let handlers: Record<string, (d: Record<string, unknown>) => Promise<Record<string, unknown>>>;

  beforeEach(async () => {
    ({ kv, handlers } = wire());
    await waitForSeed(kv);
  });

  it("seeds default slots into the right scopes on first run", async () => {
    const global = (await kv.list(KV.globalSlots)) as Array<{ label: string }>;
    const project = (await kv.list(KV.slots)) as Array<{ label: string }>;
    expect(global.map((s) => s.label).sort()).toEqual(
      ["persona", "tool_guidelines", "user_preferences"].sort(),
    );
    expect(project.map((s) => s.label).sort().length).toBeGreaterThanOrEqual(5);
  });

  it("rejects labels with bad shape", async () => {
    const res = (await handlers["mem::slot-create"]({ label: "Bad Label!" })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/label required/);
  });

  it("create then get round-trips a new slot", async () => {
    const created = (await handlers["mem::slot-create"]({
      label: "notes_todo",
      content: "hello",
      description: "scratchpad",
    })) as { success: boolean; slot: { label: string; content: string } };
    expect(created.success).toBe(true);
    expect(created.slot.content).toBe("hello");

    const fetched = (await handlers["mem::slot-get"]({ label: "notes_todo" })) as {
      success: boolean;
      slot: { content: string };
    };
    expect(fetched.success).toBe(true);
    expect(fetched.slot.content).toBe("hello");
  });

  it("rejects duplicate create", async () => {
    await handlers["mem::slot-create"]({ label: "scratch", content: "a" });
    const dup = (await handlers["mem::slot-create"]({ label: "scratch", content: "b" })) as {
      success: boolean;
      error: string;
    };
    expect(dup.success).toBe(false);
    expect(dup.error).toMatch(/already exists/);
  });

  it("append refuses writes that would blow the sizeLimit", async () => {
    await handlers["mem::slot-create"]({ label: "tight", content: "", sizeLimit: 10 });
    const ok = (await handlers["mem::slot-append"]({ label: "tight", text: "short" })) as { success: boolean };
    expect(ok.success).toBe(true);
    const tooBig = (await handlers["mem::slot-append"]({ label: "tight", text: "way too long for this slot" })) as {
      success: boolean;
      error: string;
    };
    expect(tooBig.success).toBe(false);
    expect(tooBig.error).toMatch(/exceed sizeLimit/);
  });

  it("replace refuses content above sizeLimit", async () => {
    await handlers["mem::slot-create"]({ label: "tiny", content: "", sizeLimit: 5 });
    const res = (await handlers["mem::slot-replace"]({ label: "tiny", content: "exceeds" })) as {
      success: boolean;
      error: string;
    };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/exceeds/);
  });

  it("delete removes the slot", async () => {
    await handlers["mem::slot-create"]({ label: "throwaway", content: "bye" });
    const del = (await handlers["mem::slot-delete"]({ label: "throwaway" })) as { success: boolean };
    expect(del.success).toBe(true);
    const get = (await handlers["mem::slot-get"]({ label: "throwaway" })) as { success: boolean };
    expect(get.success).toBe(false);
  });

  it("project slot shadows global slot of the same label", async () => {
    // Default seed already created a global `persona`. Populate it through
    // the public handler, then create a project-scoped override through the
    // same handler so scope validation + shadowing logic is exercised end
    // to end (no direct kv.set).
    await handlers["mem::slot-replace"]({ label: "persona", content: "global-persona" });
    const createRes = (await handlers["mem::slot-create"]({
      label: "persona",
      content: "project-override",
      scope: "project",
    })) as { success: boolean };
    expect(createRes.success).toBe(true);

    const res = (await handlers["mem::slot-get"]({ label: "persona" })) as {
      slot: { content: string };
      scope: string;
    };
    expect(res.slot.content).toBe("project-override");
    expect(res.scope).toBe("project");
  });

  it("rejects invalid sizeLimit instead of silently defaulting", async () => {
    const tooBig = (await handlers["mem::slot-create"]({
      label: "oversize",
      sizeLimit: 99999,
    })) as { success: boolean; error: string };
    expect(tooBig.success).toBe(false);
    expect(tooBig.error).toMatch(/sizeLimit must be/);

    const negative = (await handlers["mem::slot-create"]({
      label: "negative",
      sizeLimit: -1,
    })) as { success: boolean; error: string };
    expect(negative.success).toBe(false);

    const nonInteger = (await handlers["mem::slot-create"]({
      label: "fractional",
      sizeLimit: 1.5,
    })) as { success: boolean; error: string };
    expect(nonInteger.success).toBe(false);
  });

  it("rejects unknown scope values", async () => {
    const res = (await handlers["mem::slot-create"]({
      label: "bad_scope",
      scope: "wrong" as unknown as "project",
    })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/scope must be/);
  });

  it("listPinnedSlots returns only pinned slots with content", async () => {
    await handlers["mem::slot-append"]({ label: "persona", text: "helpful senior engineer" });
    const pinned = await listPinnedSlots(kv as never);
    expect(pinned.some((s) => s.label === "persona")).toBe(true);
    expect(pinned.every((s) => s.pinned && s.content.trim().length > 0)).toBe(true);
  });

  it("renderPinnedContext serialises slots into markdown", async () => {
    await handlers["mem::slot-append"]({ label: "persona", text: "senior eng" });
    const pinned = await listPinnedSlots(kv as never);
    const rendered = renderPinnedContext(pinned);
    expect(rendered).toContain("## persona");
    expect(rendered).toContain("senior eng");
  });

  it("isolates project-scoped slots by project and shadows global slots per project (Issue #1108)", async () => {
    // 1. Create a project slot in project-A
    const createA = (await handlers["mem::slot-create"]({
      label: "project_notes",
      content: "notes for project A",
      scope: "project",
      project: "project-A",
    })) as { success: boolean };
    expect(createA.success).toBe(true);

    // 2. Fetch slot from project-B -> should NOT find project-A's slot!
    const fetchB = (await handlers["mem::slot-get"]({
      label: "project_notes",
      project: "project-B",
    })) as { success: boolean; slot: unknown };
    expect(fetchB.success).toBe(false);

    // 3. Fetch slot from project-A -> should find project-A's slot
    const fetchA = (await handlers["mem::slot-get"]({
      label: "project_notes",
      project: "project-A",
    })) as { success: boolean; slot: { content: string } };
    expect(fetchA.success).toBe(true);
    expect(fetchA.slot.content).toBe("notes for project A");

    // 4. Listing slots for project-B should NOT contain project_notes from project-A
    const listB = (await handlers["mem::slot-list"]({ project: "project-B" })) as {
      success: boolean;
      slots: Array<{ label: string }>;
    };
    expect(listB.slots.some((s) => s.label === "project_notes")).toBe(false);

    // 5. listPinnedSlots with project parameter should isolate pinned project slots
    await handlers["mem::slot-replace"]({
      label: "project_context",
      content: "Monolith backend files",
      project: "Monolith",
    });
    const pinnedDaily = await listPinnedSlots(kv as never, "daily");
    expect(pinnedDaily.some((s) => s.content.includes("Monolith backend files"))).toBe(false);
    const pinnedMonolith = await listPinnedSlots(kv as never, "Monolith");
    expect(pinnedMonolith.some((s) => s.content.includes("Monolith backend files"))).toBe(true);
  });
});

describe("slots — reflect", () => {
  let kv: ReturnType<typeof mockKV>;
  let handlers: Record<string, (d: Record<string, unknown>) => Promise<Record<string, unknown>>>;

  beforeEach(async () => {
    ({ kv, handlers } = wire());
    await waitForSeed(kv);
  });

  it("no-ops when the session has no observations", async () => {
    const res = (await handlers["mem::slot-reflect"]({ sessionId: "empty-session" })) as {
      success: boolean;
      applied: number;
    };
    expect(res.success).toBe(true);
    expect(res.applied).toBe(0);
  });

  it("moves TODO-flavoured observations into pending_items and counts patterns", async () => {
    const sessionId = "sess_reflect";
    const obsKey = KV.observations(sessionId);
    const base = {
      id: "obs1",
      sessionId,
      timestamp: new Date().toISOString(),
      type: "error" as const,
      title: "TODO: wire up retries",
      subtitle: "",
      facts: [],
      narrative: "agent left a TODO for retries",
      concepts: [],
      files: ["src/retry.ts"],
      importance: 5,
    };
    await kv.set(obsKey, "obs1", base);
    await kv.set(obsKey, "obs2", {
      ...base,
      id: "obs2",
      title: "compile error",
      narrative: "tsc failed",
      files: ["src/other.ts"],
      type: "error",
    });
    const res = (await handlers["mem::slot-reflect"]({ sessionId })) as {
      success: boolean;
      applied: number;
      observationsReviewed: number;
    };
    expect(res.success).toBe(true);
    expect(res.observationsReviewed).toBe(2);
    expect(res.applied).toBeGreaterThan(0);

    const pending = (await handlers["mem::slot-get"]({ label: "pending_items" })) as {
      slot: { content: string };
    };
    expect(pending.slot.content).toContain("TODO: wire up retries");

    const patterns = (await handlers["mem::slot-get"]({ label: "session_patterns" })) as {
      slot: { content: string };
    };
    expect(patterns.slot.content).toMatch(/errors: 2/);
  });

  it("truncates project_context at line boundaries without slicing mid-line or creating dangling prefix fragments", async () => {
    const slot = (await handlers["mem::slot-get"]({ label: "project_context" })) as {
      slot: { sizeLimit: number };
    };
    const limit = slot.slot.sizeLimit;

    const line = "- /Volumes/DB/Work/TCC-Technology/LTJ/SOOK/Backend/Monolith/order-service/pkg/repository/ordermcrepo/order.go\n";
    const initial = line.repeat(Math.floor(2950 / line.length));
    await handlers["mem::slot-replace"]({ label: "project_context", content: initial });

    const sessionId = "sess_truncation_repro";
    const obsKey = KV.observations(sessionId);
    await kv.set(obsKey, "obs_files", {
      id: "obs_files",
      sessionId,
      timestamp: new Date().toISOString(),
      type: "command",
      title: "edit files",
      files: [
        "/Volumes/DB/Work/TCC-Technology/LTJ/SOOK/Backend/Monolith/order-service/pkg/service/paymentsvc/payment.go",
        "/Volumes/DB/Work/TCC-Technology/LTJ/SOOK/Backend/Monolith/order-service/pkg/service/fcmsvc/fcm.go",
      ],
      importance: 5,
    });

    await handlers["mem::slot-reflect"]({ sessionId });

    const updated = (await handlers["mem::slot-get"]({ label: "project_context" })) as {
      slot: { content: string };
    };
    const content = updated.slot.content;

    expect(content.length).toBeLessThanOrEqual(limit);
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    for (const l of lines) {
      expect(l.startsWith("- ")).toBe(true);
      expect(l).not.toMatch(/^r-service/);
    }
  });

  describe("boundary truncation helpers", () => {
    it("truncateAtLineBoundaryFromEnd returns text unmodified if within limit", () => {
      const text = "line1\nline2\nline3";
      expect(truncateAtLineBoundaryFromEnd(text, 100)).toBe(text);
    });

    it("truncateAtLineBoundaryFromEnd drops partial line at start when over limit", () => {
      const text = "- /path/to/very/long/first/file.ts\n- /path/to/second.ts\n- /path/to/third.ts";
      // sizeLimit cuts somewhere in the middle of first file
      const limit = 45;
      const res = truncateAtLineBoundaryFromEnd(text, limit);
      expect(res.length).toBeLessThanOrEqual(limit);
      expect(res.startsWith("- ")).toBe(true);
      expect(res).not.toContain("very/long/first");
      expect(res).toContain("- /path/to/second.ts");
      expect(res).toContain("- /path/to/third.ts");
    });

    it("truncateAtLineBoundaryFromEnd falls back to raw slice when no newline exists", () => {
      const text = "nonewlineatallanywhere";
      expect(truncateAtLineBoundaryFromEnd(text, 5)).toBe("where");
    });

    it("truncateAtLineBoundaryFromStart drops partial line at end when over limit", () => {
      const text = "- item 1\n- item 2\n- item 3";
      // cuts in the middle of item 3
      const limit = 20;
      const res = truncateAtLineBoundaryFromStart(text, limit);
      expect(res.length).toBeLessThanOrEqual(limit);
      expect(res).toBe("- item 1\n- item 2");
    });

    it("truncateAtLineBoundaryFromStart falls back to raw slice when no newline exists", () => {
      const text = "nonewlineatallanywhere";
      expect(truncateAtLineBoundaryFromStart(text, 5)).toBe("nonew");
    });
  });
});

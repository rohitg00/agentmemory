import { describe, expect, it, vi } from "vitest";
import { registerPatternsFunction } from "../src/functions/patterns.js";
import { KV } from "../src/state/schema.js";

function makeKv(data: Map<string, unknown[]>) {
  return {
    list: vi.fn(async (scope: string) => data.get(scope) ?? []),
  };
}

describe("registerPatternsFunction", () => {
  it("detects co-change and repeated error patterns, then generates rules", async () => {
    const sessions = [
      { id: "s1", project: "/repo" },
      { id: "s2", project: "/repo" },
      { id: "s3", project: "/repo" },
      { id: "s4", project: "/repo" },
      { id: "skip", project: "/other" },
    ];
    const observations = [
      { type: "file_edit", files: ["a.ts", "b.ts"], title: "edit" },
      { type: "error", files: [], title: "Build failed" },
    ];
    const data = new Map<string, unknown[]>([
      [KV.sessions, sessions],
      [KV.observations("s1"), observations],
      [KV.observations("s2"), observations],
      [KV.observations("s3"), observations],
      [KV.observations("s4"), observations],
      [KV.observations("skip"), [{ type: "file_edit", files: ["x.ts", "y.ts"], title: "edit" }]],
    ]);
    const callbacks = new Map<string, any>();
    const sdk = {
      registerFunction: vi.fn((id: string, cb: any) => callbacks.set(id, cb)),
      trigger: vi.fn(async ({ function_id, payload }) => callbacks.get(function_id)(payload)),
    };

    registerPatternsFunction(sdk as any, makeKv(data) as any);

    const patterns = await callbacks.get("mem::patterns")({ project: "/repo" });
    expect(patterns.patterns).toEqual([
      expect.objectContaining({ type: "co_change", frequency: 4, files: ["a.ts", "b.ts"] }),
      expect.objectContaining({ type: "error_repeat", frequency: 4, sessions: ["s1", "s2", "s3", "s4"] }),
    ]);

    await expect(callbacks.get("mem::generate-rules")({ project: "/repo" })).resolves.toEqual({
      rules: [
        "When modifying a.ts, also check b.ts (co-changed 4 times).",
        "Watch for: Recurring error: build failed (occurred 4 times across 4 sessions).",
      ],
    });
  });

  it("returns no patterns below frequency thresholds", async () => {
    const data = new Map<string, unknown[]>([
      [KV.sessions, [{ id: "s1", project: "/repo" }]],
      [KV.observations("s1"), [{ type: "error", files: ["a.ts"], title: "Only once" }]],
    ]);
    const callbacks = new Map<string, any>();
    const sdk = { registerFunction: vi.fn((id: string, cb: any) => callbacks.set(id, cb)) };

    registerPatternsFunction(sdk as any, makeKv(data) as any);

    await expect(callbacks.get("mem::patterns")({})).resolves.toEqual({ patterns: [] });
  });

  it("ignores sessions without usable observations and skips weak rule candidates", async () => {
    const data = new Map<string, unknown[]>([
      [
        KV.sessions,
        [
          { id: "empty", project: "/repo" },
          { id: "nofiles", project: "/repo" },
          { id: "one", project: "/repo" },
          { id: "two", project: "/repo" },
          { id: "three", project: "/repo" },
        ],
      ],
      [KV.observations("empty"), []],
      [KV.observations("nofiles"), [{ type: "file_edit", title: "note" }]],
      [KV.observations("one"), [{ type: "file_edit", files: ["a.ts", "b.ts", "c.ts", "d.ts"], title: "edit" }]],
      [KV.observations("two"), [{ type: "file_edit", files: ["a.ts", "b.ts", "c.ts", "d.ts"], title: "edit" }]],
      [
        KV.observations("three"),
        [
          { type: "file_edit", files: ["a.ts", "b.ts"], title: "edit" },
          { type: "error", files: [], title: "Transient" },
          { type: "error", files: [], title: "Transient" },
        ],
      ],
    ]);
    const callbacks = new Map<string, any>();
    const sdk = {
      registerFunction: vi.fn((id: string, cb: any) => callbacks.set(id, cb)),
      trigger: vi.fn(async ({ function_id, payload }) => callbacks.get(function_id)(payload)),
    };

    registerPatternsFunction(sdk as any, makeKv(data) as any);

    const patterns = await callbacks.get("mem::patterns")({ project: "/repo" });
    expect(patterns.patterns).toEqual([
      expect.objectContaining({ type: "co_change", frequency: 3 }),
      expect.objectContaining({ type: "error_repeat", frequency: 2 }),
    ]);
    await expect(callbacks.get("mem::generate-rules")({ project: "/repo" })).resolves.toEqual({ rules: [] });
  });
});

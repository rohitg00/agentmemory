import { describe, it, expect, vi } from "vitest";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import type { CompressedObservation, HybridSearchResult } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function fixture(count: number, sharedSession: boolean) {
  const records = new Map<string, unknown>();
  const get = vi.fn(async (scope: string, key: string) => records.get(scope + "/" + key) ?? null);
  const kv = { get, set: vi.fn(async () => {}), list: vi.fn(async () => []) };
  const hits: HybridSearchResult[] = Array.from({ length: count }, (_, i) => {
    const sessionId = sharedSession ? "shared" : "session-" + i;
    const observation: CompressedObservation = { id: "obs-" + i, sessionId, timestamp: "2026-01-01T00:00:00Z",
      type: "discovery", title: "policy", narrative: "policy", facts: [], concepts: [], files: [], importance: 5 };
    records.set("mem:sessions/" + sessionId, { project: "orbit" });
    return { observation, sessionId, bm25Score: 1, vectorScore: 0, combinedScore: 1 };
  });
  let handle!: (data: Record<string, unknown>) => Promise<{ results: Array<{ obsId: string }> }>;
  const trigger = vi.fn(async () => ({ success: true, lessons: [] }));
  const sdk = { registerFunction: (_name: string, fn: typeof handle) => { handle = fn; }, trigger };
  registerSmartSearchFunction(sdk as never, kv as never, async () => hits);
  return { get, records, trigger, query: (data: Record<string, unknown>) => handle(data) };
}

describe("smart search project validation", () => {
  it("bounds concurrent state lookups for a large scoped result page", async () => {
    const f = fixture(60, false);
    const original = f.get.getMockImplementation()!;
    let active = 0;
    let maximum = 0;
    f.get.mockImplementation(async (scope, key) => {
      if (scope !== "mem:sessions" && scope !== "mem:memories") return original(scope, key);
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const result = await original(scope, key);
      active--;
      return result;
    });
    const result = await f.query({ query: "policy", project: "orbit", limit: 100, includeLessons: false });
    expect(result.results).toHaveLength(60);
    expect(maximum).toBeLessThanOrEqual(10);
  });

  it("shares in-flight project reads for results in the same session", async () => {
    const f = fixture(30, true);
    const result = await f.query({ query: "policy", project: "orbit", limit: 100, includeLessons: false });
    expect(result.results).toHaveLength(30);
    expect(f.get.mock.calls.filter(([scope, key]) => scope === "mem:sessions" && key === "shared")).toHaveLength(1);
  });

  it.each(["mem:sessions", "mem:memories"])("reports %s lookup failure instead of passing or dropping rows silently", async (failedScope) => {
    const f = fixture(1, true);
    const original = f.get.getMockImplementation()!;
    f.get.mockImplementation(async (scope, key) => {
      if (scope === failedScope) throw new Error("state unavailable");
      return original(scope, key);
    });
    await expect(f.query({ query: "policy", project: "orbit", includeLessons: false })).rejects.toThrow("state unavailable");
  });

  it("uses the same normalized project for memories and lessons", async () => {
    const f = fixture(1, true);
    const result = await f.query({ query: "policy", project: " orbit " });
    expect(result.results).toHaveLength(1);
    expect(f.trigger).toHaveBeenCalledWith({ function_id: "mem::lesson-recall", payload: { query: "policy", project: "orbit", limit: 10 } });
  });

  it("excludes unscoped evidence from an explicit project but preserves unfiltered recall", async () => {
    const f = fixture(1, true);
    f.records.clear();
    expect((await f.query({ query: "policy", project: "orbit", includeLessons: false })).results).toEqual([]);
    expect((await f.query({ query: "policy", includeLessons: false })).results).toHaveLength(1);
  });
});

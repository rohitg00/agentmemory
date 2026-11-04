import { afterEach, expect, it, vi } from "vitest";
import { getSearchIndex, registerSearchFunction, setHybridRanker, setVectorIndex } from "../src/functions/search.js";
import { recordAccessBatch } from "../src/functions/access-tracker.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation } from "../src/types.js";

vi.mock("../src/functions/access-tracker.js", () => ({ recordAccessBatch: vi.fn() }));
vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); getSearchIndex().clear(); });

it("records access only for emitted recall content, not budget-excluded matches", async () => {
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
  setHybridRanker(null);
  setVectorIndex(null);
  const observations: CompressedObservation[] = ["first", "second"].map((name) => ({
    id: `obs_${name}`, sessionId: "ses_budget", title: "deployment policy", type: "decision",
    timestamp: "2026-01-01T00:00:00Z", facts: [], narrative: name + " policy ".repeat(1200),
    concepts: [], files: [], importance: 8,
  }));
  const index = getSearchIndex();
  for (const observation of observations) index.add(observation);
  vi.spyOn(index, "search").mockReturnValue(observations.map((observation, i) => ({
    obsId: observation.id, sessionId: observation.sessionId, score: 10 - i,
  })));
  const kv = { get: async (scope: string, id: string) =>
    scope === KV.observations("ses_budget") ? observations.find((observation) => observation.id === id) : null };
  let search: (data: unknown) => Promise<any>;
  registerSearchFunction({ registerFunction: (_name: string, fn: typeof search) => { search = fn; } } as never, kv as never);
  const preview = await search!({ query: "policy", token_budget: 300 });
  expect(preview.results).toHaveLength(1);
  expect(preview.results[0].content_truncated).toBe(true);
  expect(preview.excluded_by_budget).toBe(1);
  expect(recordAccessBatch).toHaveBeenLastCalledWith(kv, ["obs_first"]);

  const excluded = await search!({ query: "policy", token_budget: 1 });
  expect(excluded.matched_count).toBe(2);
  expect(excluded.results).toEqual([]);
  expect(recordAccessBatch).toHaveBeenLastCalledWith(kv, []);
});

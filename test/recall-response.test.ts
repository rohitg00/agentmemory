import { describe, expect, it } from "vitest";
import { buildRecallResponse, type RecallFormat } from "../src/functions/recall-response.js";
import type { SearchResult } from "../src/types.js";

function savedMemory(id = "mem_decision", title = "Database migration decision"): SearchResult {
  const narrative = "Use the existing migration runner and retain the rollback plan. ".repeat(100);
  return {
    observation: {
      id,
      sessionId: "memory",
      timestamp: "2026-10-10T00:00:00.000Z",
      type: "decision",
      title,
      facts: [narrative],
      narrative,
      concepts: ["database", "migration"],
      files: ["src/database.ts"],
      importance: 8,
    },
    score: 25.3,
    sessionId: "memory",
    layer: "memory",
  };
}

function smallMemory(id = "mem_small"): SearchResult {
  const result = savedMemory(id, "Small decision");
  result.observation.narrative = "Use migrations.";
  result.observation.facts = ["Use migrations."];
  return result;
}

function estimatedResults(results: unknown[]): number {
  return results.reduce<number>((sum, result) => sum + Math.max(1, Math.ceil(JSON.stringify(result).length / 3)), 0);
}

function firstId(response: ReturnType<typeof buildRecallResponse>): string | undefined {
  const result = response.results[0];
  if (!result) return undefined;
  return "observation" in result ? result.observation.id : result.obsId;
}

const formats: RecallFormat[] = ["full", "compact", "narrative"];

describe.each(formats)("recall response in %s format", (format) => {
  it("keeps all results without a budget and reports the candidate page size", () => {
    const response = buildRecallResponse([savedMemory(), smallMemory()], format);

    expect(response.format).toBe(format);
    expect(response.results).toHaveLength(2);
    expect(response.tokens_used).toBe(estimatedResults(response.results));
    expect(response.tokens_budget).toBeUndefined();
    expect(response.matched_count).toBe(2);
    expect(response.excluded_by_budget).toBe(0);
    expect(response.excluded_results).toEqual([]);
    expect(response.excluded_results_truncated).toBe(false);
    expect(response.truncated).toBe(false);
    expect(response.results[0].layer).toBe("memory");
  });

  it("preserves the unchanged result at an exact budget fit", () => {
    const result = smallMemory();
    const complete = buildRecallResponse([result], format);
    const response = buildRecallResponse([result], format, complete.tokens_used);

    expect(response.results).toEqual(complete.results);
    expect(response.results[0]).not.toHaveProperty("content_truncated");
    expect(response.tokens_used).toBe(complete.tokens_used);
    expect(response.truncated).toBe(false);
  });

  it("clips the first ranked match instead of returning a lower ranked small result", () => {
    const first = savedMemory("mem_first", "Database migration decision ".repeat(200));
    const response = buildRecallResponse([first, smallMemory()], format, 250);

    expect(response.results).toHaveLength(1);
    expect(firstId(response)).toBe("mem_first");
    expect(response.results[0].content_truncated).toBe(true);
    expect(response.results[0].layer).toBe("memory");
    expect(response.results[0].score).toBe(first.score);
    expect(response.results[0].sessionId).toBe(first.sessionId);
    expect(response.tokens_used).toBe(estimatedResults(response.results));
    expect(response.tokens_used).toBeLessThanOrEqual(250);
    expect(response.matched_count).toBe(2);
    expect(response.excluded_by_budget).toBe(1);
    expect(response.excluded_results).toEqual([
      { obsId: "mem_small", sessionId: "memory", title: "Small decision" },
    ]);
    expect(response.truncated).toBe(true);
  });

  it("keeps a ranked prefix when a later result exceeds the remaining budget", () => {
    const first = smallMemory("mem_first");
    const budget = buildRecallResponse([first], format).tokens_used;
    const response = buildRecallResponse([first, savedMemory(), smallMemory("mem_last")], format, budget);

    expect(response.results).toHaveLength(1);
    expect(firstId(response)).toBe("mem_first");
    expect(response.results[0]).not.toHaveProperty("content_truncated");
    expect(response.excluded_by_budget).toBe(2);
    expect(response.excluded_results.map((result) => result.obsId)).toEqual(["mem_decision", "mem_last"]);
    expect(response.tokens_used).toBe(budget);
    expect(response.minimum_budget).toBeUndefined();
  });

  it("distinguishes a tiny budget from no matches and reports the recoverable minimum", () => {
    const result = savedMemory();
    const response = buildRecallResponse([result], format, 1);
    const empty = buildRecallResponse([], format, 1);

    expect(response.results).toEqual([]);
    expect(response.tokens_used).toBe(0);
    expect(response.matched_count).toBe(1);
    expect(response.excluded_by_budget).toBe(1);
    expect(response.excluded_results[0].obsId).toBe(result.observation.id);
    expect(response.minimum_budget).toBeGreaterThan(1);
    expect(response.truncated).toBe(true);
    expect(empty.matched_count).toBe(0);
    expect(empty.excluded_by_budget).toBe(0);
    expect(empty.minimum_budget).toBeUndefined();
    expect(empty.truncated).toBe(false);

    const atMinimum = buildRecallResponse([result], format, response.minimum_budget);
    expect(firstId(atMinimum)).toBe(result.observation.id);
    expect(atMinimum.tokens_used).toBeLessThanOrEqual(response.minimum_budget!);
    expect(atMinimum.minimum_budget).toBeUndefined();
    const belowMinimum = buildRecallResponse([result], format, response.minimum_budget! - 1);
    expect(belowMinimum.results).toEqual([]);
  });

  it("preserves valid Unicode and accounts for JSON escaping when clipping", () => {
    const first = savedMemory("mem_unicode", '漢字😀"\\\n'.repeat(400));
    first.observation.narrative = '決定😀"\\\n'.repeat(400);
    for (const budget of [200, 201, 202, 203, 250]) {
      const response = buildRecallResponse([first], format, budget);
      expect(response.results).toHaveLength(1);
      expect(response.tokens_used).toBe(estimatedResults(response.results));
      expect(response.tokens_used).toBeLessThanOrEqual(budget);
      const result = response.results[0];
      const content = "observation" in result ? result.observation : result;
      expect(Buffer.from(content.title, "utf8").toString("utf8")).toBe(content.title);
      if ("narrative" in content) {
        expect(Buffer.from(content.narrative, "utf8").toString("utf8")).toBe(content.narrative);
      }
    }
  });

  it("bounds excluded references without losing the excluded count", () => {
    const results = Array.from({ length: 15 }, (_, index) => savedMemory(`mem_${index}`, "😀".repeat(100)));
    const response = buildRecallResponse(results, format, 1);

    expect(response.matched_count).toBe(15);
    expect(response.excluded_by_budget).toBe(15);
    expect(response.excluded_results).toHaveLength(10);
    expect(response.excluded_results_truncated).toBe(true);
    expect(response.excluded_results.every((result) => result.title.length <= 120)).toBe(true);
    expect(response.excluded_results.every((result) => Buffer.from(result.title).toString() === result.title)).toBe(true);
  });

  it("reports a truthful minimum when the original is cheaper than a marked preview", () => {
    const result = smallMemory();
    result.observation.title = "";
    result.observation.narrative = "";
    result.observation.facts = [];
    result.observation.files = [];
    result.observation.concepts = [];
    const complete = buildRecallResponse([result], format);
    const response = buildRecallResponse([result], format, 1);

    expect(response.minimum_budget).toBe(complete.tokens_used);
    const atMinimum = buildRecallResponse([result], format, response.minimum_budget);
    expect(atMinimum.results).toEqual(complete.results);
    expect(atMinimum.truncated).toBe(false);
  });
});

describe("full recall previews", () => {
  it("retains ownership and trust metadata while omitting oversized origin detail", () => {
    const result = savedMemory();
    result.observation.agentId = "agent-a";
    result.observation.confidence = 0.3;
    result.observation.origin = {
      channel: "import", capturedAt: "2026-10-09T12:00:00.000Z", detail: "x".repeat(10_000),
    };
    const original = structuredClone(result);
    const response = buildRecallResponse([result], "full", 250);

    if (response.format !== "full") throw new Error("Expected full response");
    expect(response.results[0].observation).toMatchObject({
      agentId: "agent-a", confidence: 0.3,
      origin: { channel: "import", capturedAt: "2026-10-09T12:00:00.000Z" },
    });
    expect(response.results[0].observation.origin).not.toHaveProperty("detail");
    expect(response.results[0].content_truncated).toBe(true);
    expect(response.tokens_used).toBeLessThanOrEqual(250);
    expect(response.tokens_used).toBe(estimatedResults(response.results));
    expect(result).toEqual(original);

    const tiny = buildRecallResponse([result], "full", 1);
    const atMinimum = buildRecallResponse([result], "full", tiny.minimum_budget);
    if (atMinimum.format !== "full") throw new Error("Expected full response");
    expect(atMinimum.results[0].observation.agentId).toBe("agent-a");
    expect(atMinimum.results[0].observation.origin?.channel).toBe("import");
    expect(atMinimum.tokens_used).toBeLessThanOrEqual(tiny.minimum_budget!);
  });

  it("uses remaining budget for the next ranked result after dropping oversized optional fields", () => {
    const first = smallMemory("mem_first");
    first.observation.imageData = "x".repeat(3_000);
    const second = smallMemory("mem_second");
    const response = buildRecallResponse([first, second], "full", 300);

    if (response.format !== "full") throw new Error("Expected full response");
    expect(response.results.map((result) => result.observation.id)).toEqual(["mem_first", "mem_second"]);
    expect(response.results[0].content_truncated).toBe(true);
    expect(response.results[1]).toEqual(second);
    expect(response.tokens_used).toBe(estimatedResults(response.results));
    expect(response.tokens_used).toBeLessThanOrEqual(300);
    expect(response.excluded_by_budget).toBe(0);
    expect(response.excluded_results).toEqual([]);
    expect(response.truncated).toBe(true);

    const blocked = buildRecallResponse([first, savedMemory("mem_middle"), second], "full", 300);
    if (blocked.format !== "full") throw new Error("Expected full response");
    expect(blocked.results.map((result) => result.observation.id)).toEqual(["mem_first"]);
    expect(blocked.excluded_results.map((result) => result.obsId)).toEqual(["mem_middle", "mem_second"]);
  });

  it("omits duplicate and oversized fields while retaining an actual content prefix", () => {
    const result = savedMemory();
    result.observation.subtitle = "x".repeat(10_000);
    result.observation.imageData = "x".repeat(10_000);
    result.observation.imageDescription = "x".repeat(10_000);
    result.observation.files = ["x".repeat(10_000)];
    result.observation.concepts = ["x".repeat(10_000)];
    const original = structuredClone(result);
    Object.freeze(result.observation);
    Object.freeze(result);
    const response = buildRecallResponse([result], "full", 250);

    expect(response.format).toBe("full");
    if (response.format !== "full") throw new Error("Expected full response");
    const preview = response.results[0];
    expect(preview.content_truncated).toBe(true);
    expect(preview.observation.facts).toEqual([]);
    expect(preview.observation.files).toEqual([]);
    expect(preview.observation.concepts).toEqual([]);
    expect(preview.observation).not.toHaveProperty("subtitle");
    expect(preview.observation).not.toHaveProperty("imageData");
    expect(preview.observation).not.toHaveProperty("imageDescription");
    expect(preview.observation.narrative.length).toBeGreaterThan(0);
    expect(result.observation.narrative.startsWith(preview.observation.narrative)).toBe(true);
    expect(preview.observation.title).toBe(original.observation.title);
    expect(preview.observation.timestamp).toBe(original.observation.timestamp);
    expect(preview.observation.type).toBe(original.observation.type);
    expect(result).toEqual(original);
  });

  it("uses facts for a preview when the observation has no narrative", () => {
    const result = savedMemory();
    result.observation.narrative = "";
    const response = buildRecallResponse([result], "full", 250);

    if (response.format !== "full") throw new Error("Expected full response");
    expect(response.results[0].observation.narrative).not.toBe("");
    expect(result.observation.facts[0].startsWith(response.results[0].observation.narrative)).toBe(true);
  });
});

it("renders narrative text from the packed rows only", () => {
  const response = buildRecallResponse([savedMemory(), smallMemory("mem_omitted")], "narrative", 250);

  if (response.format !== "narrative") throw new Error("Expected narrative response");
  expect(response.results).toHaveLength(1);
  expect(response.text).toBe(`1. ${response.results[0].title}\n${response.results[0].narrative}`);
  expect(response.text).not.toContain("Small decision");
  expect(response.excluded_by_budget).toBe(1);
});

import { describe, expect, it } from "vitest";
import { scoreRecallBenchmark } from "../eval/recall/score.js";

describe("recall benchmark scoring", () => {
  it("measures contamination and token violations independently from hit rate", () => {
    const score = scoreRecallBenchmark([
      { id: "a", query: "q", projectId: "p", expectedMemoryIds: ["good"], forbiddenMemoryIds: ["bad"], maxAcceptableTokens: 10 },
    ], {
      a: { selectedIds: ["good", "bad"], injectedTokens: 11, duplicateIds: [], staleIds: [] },
    });
    expect(score).toMatchObject({ hitRate: 1, precision: 0.5, crossProjectContaminationRate: 0.5, budgetViolations: 1 });
  });
});

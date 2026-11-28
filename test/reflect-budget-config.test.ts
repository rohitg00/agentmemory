import { describe, it, expect, afterEach, vi } from "vitest";
import { getReflectBudgetMs, __resetEnvFileCache } from "../src/config.js";

describe("AGENTMEMORY_REFLECT_BUDGET_MS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetEnvFileCache();
  });

  function budgetFor(value: string): number {
    vi.stubEnv("AGENTMEMORY_REFLECT_BUDGET_MS", value);
    __resetEnvFileCache();
    return getReflectBudgetMs();
  }

  it("takes a budget of at least a minute as given", () => {
    expect(budgetFor("900000")).toBe(900_000);
    expect(budgetFor("60000")).toBe(60_000);
  });

  it("raises a budget too short to start one call to a minute", () => {
    expect(budgetFor("10000")).toBe(60_000);
    expect(budgetFor("1")).toBe(60_000);
  });

  it("falls back to ten minutes for a missing, zero, negative, unreadable or unsafe value", () => {
    for (const value of ["", "0", "-5", "soon", "99999999999999999999"]) {
      expect(budgetFor(value)).toBe(600_000);
    }
  });
});

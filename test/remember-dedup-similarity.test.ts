import { describe, it, expect } from "vitest";
import { jaccardSimilarity } from "../src/state/schema.js";
import { isNegationConflict } from "../src/state/memory-dedup.js";

describe("jaccardSimilarity — English (regression)", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSimilarity("hello world", "hello world")).toBe(1);
  });

  it("returns 0 for completely disjoint strings", () => {
    expect(jaccardSimilarity("apple banana", "xyz qwerty")).toBe(0);
  });

  it("returns intermediate value for partial overlap", () => {
    const sim = jaccardSimilarity("the quick brown fox", "the quick red fox");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("jaccardSimilarity — CJK-aware", () => {
  it("gives high similarity for identical Chinese text", () => {
    const a = "使用代码审查来确保质量";
    const b = "使用代码审查来确保质量";
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("gives high similarity for near-identical Chinese with punctuation differences", () => {
    const a = "使用代码审查来确保质量。";
    const b = "使用代码审查来确保质量";
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("gives high similarity for reordered Chinese preference lists", () => {
    const a = "使用独立审查子代理 进行代码审查";
    const b = "进行代码审查 使用独立审查子代理";
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("gives lower similarity for distinct Chinese preferences", () => {
    const a = "使用代码审查来确保质量";
    const b = "使用持续集成来确保部署";
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeLessThan(0.7);
  });

  it("handles mixed Chinese/English text", () => {
    const a = "preference: 使用 eslint 进行代码检查";
    const b = "preference: 使用 eslint 进行代码检查";
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("gives high similarity for near-identical mixed Chinese/English", () => {
    const a = "preference: 使用 eslint 进行代码检查";
    const b = "使用 eslint 进行代码检查 preference";
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("returns 0 when one side is empty and the other is not", () => {
    expect(jaccardSimilarity("使用代码审查", "")).toBe(0);
  });

  it("returns 1 when both sides are empty", () => {
    expect(jaccardSimilarity("", "")).toBe(1);
  });
});

describe("isNegationConflict", () => {
  it("detects English do vs do-not", () => {
    expect(isNegationConflict("always use strict mode", "do not use strict mode")).toBe(true);
  });

  it("detects English never vs affirmative", () => {
    expect(isNegationConflict("use console.log for debugging", "never use console.log for debugging")).toBe(true);
  });

  it("does not flag both-negated pairs", () => {
    expect(isNegationConflict("do not use var", "never use var")).toBe(false);
  });

  it("does not flag both-affirmative pairs", () => {
    expect(isNegationConflict("use const", "use const everywhere")).toBe(false);
  });

  it("detects Chinese 不要 vs affirmative", () => {
    expect(isNegationConflict("使用 var 声明变量", "不要使用 var 声明变量")).toBe(true);
  });

  it("detects Chinese 别 vs affirmative", () => {
    expect(isNegationConflict("提交前运行测试", "别提交前运行测试")).toBe(true);
  });

  it("does not flag both-negated Chinese pairs", () => {
    expect(isNegationConflict("不要使用 var", "别使用 var")).toBe(false);
  });

  it("does not flag both-affirmative Chinese pairs", () => {
    expect(isNegationConflict("使用 const", "使用 const 声明")).toBe(false);
  });
});
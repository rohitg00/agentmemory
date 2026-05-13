import { describe, it, expect, beforeEach } from "vitest";
import { SearchIndex } from "../src/state/search-index.js";
import { segmentCjk } from "../src/state/cjk-segmenter.js";
import type { CompressedObservation } from "../src/types.js";

function makeObs(
  overrides: Partial<CompressedObservation> = {},
): CompressedObservation {
  return {
    id: "obs_1",
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: "Edit auth middleware",
    subtitle: "JWT validation",
    facts: ["Added token check"],
    narrative: "Modified the auth middleware to validate JWT tokens",
    concepts: ["authentication", "jwt"],
    files: ["src/middleware/auth.ts"],
    importance: 7,
    ...overrides,
  };
}

describe("SearchIndex", () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = new SearchIndex();
  });

  it("starts empty", () => {
    expect(index.size).toBe(0);
  });

  it("adds and finds observations", () => {
    index.add(makeObs());
    expect(index.size).toBe(1);
    const results = index.search("auth");
    expect(results.length).toBe(1);
    expect(results[0].obsId).toBe("obs_1");
  });

  it("returns empty for no matches", () => {
    index.add(makeObs());
    expect(index.search("database")).toEqual([]);
  });

  it("scores exact matches higher than prefix matches", () => {
    index.add(
      makeObs({
        id: "obs_exact",
        title: "redis cache",
        narrative: "Set up redis caching layer",
        concepts: ["redis"],
        facts: ["Added redis"],
        files: ["src/redis.ts"],
      }),
    );
    index.add(
      makeObs({
        id: "obs_prefix",
        title: "redistool handler",
        narrative: "Set up redistool for ops",
        concepts: ["redistool"],
        facts: ["Added redistool"],
        files: ["src/redistool.ts"],
      }),
    );
    const results = index.search("redis");
    const exact = results.find((r) => r.obsId === "obs_exact");
    const prefix = results.find((r) => r.obsId === "obs_prefix");
    expect(exact).toBeDefined();
    expect(prefix).toBeDefined();
    expect(exact!.score).toBeGreaterThanOrEqual(prefix!.score);
  });

  it("respects limit", () => {
    for (let i = 0; i < 30; i++) {
      index.add(makeObs({ id: `obs_${i}`, title: `auth feature ${i}` }));
    }
    expect(index.search("auth", 5).length).toBe(5);
  });

  it("clears the index", () => {
    index.add(makeObs());
    index.clear();
    expect(index.size).toBe(0);
    expect(index.search("auth")).toEqual([]);
  });

  it("returns empty for empty query", () => {
    index.add(makeObs());
    expect(index.search("")).toEqual([]);
  });

  it("searches across multiple fields", () => {
    index.add(
      makeObs({ id: "obs_file", title: "something", files: ["auth.ts"] }),
    );
    expect(index.search("auth").length).toBe(1);
  });

  it("handles multiple query terms", () => {
    index.add(
      makeObs({
        id: "obs_both",
        title: "redis cache",
        narrative: "Set up redis and cache layer",
        concepts: ["redis", "cache"],
        facts: ["Added caching"],
        files: ["src/cache.ts"],
      }),
    );
    index.add(
      makeObs({
        id: "obs_one",
        title: "redis only",
        narrative: "Set up redis connection",
        concepts: ["redis"],
        facts: ["Added redis"],
        files: ["src/redis.ts"],
      }),
    );
    const results = index.search("redis cache");
    expect(results[0].obsId).toBe("obs_both");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("indexes and finds non-ASCII (Greek) text", () => {
    index.add(
      makeObs({
        id: "obs_greek",
        title: "Προβολή μνήμης",
        narrative: "Δοκιμάζουμε αναζήτηση σε ελληνικά",
        concepts: ["δοκιμή", "μνήμη"],
      }),
    );
    const results = index.search("μνήμη");
    expect(results.length).toBe(1);
    expect(results[0].obsId).toBe("obs_greek");
  });

  it("tokenizes mixed ASCII and non-ASCII (Greek) queries", () => {
    index.add(
      makeObs({
        id: "obs_mixed",
        title: "JWT middleware ρύθμιση",
        narrative: "Configured JWT with ελληνικά σχόλια",
        concepts: ["auth", "jwt", "ρύθμιση"],
      }),
    );
    const results = index.search("JWT ρύθμιση");
    expect(results.length).toBe(1);
    expect(results[0].obsId).toBe("obs_mixed");
  });

  it("segments Chinese (Han) text into words", () => {
    index.add(
      makeObs({
        id: "obs_zh",
        title: "项目记忆存储",
        narrative: "我们正在测试中文分词",
        concepts: ["项目", "记忆"],
      }),
    );
    const results = index.search("项目");
    expect(results.length).toBeGreaterThan(0);
    const hit = results.find((r) => r.obsId === "obs_zh");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThan(0);
  });

  it("segments Japanese (kana + kanji) text into words", () => {
    index.add(
      makeObs({
        id: "obs_ja",
        title: "プロジェクト記憶",
        narrative: "日本語の分かち書きをテストしています",
        concepts: ["プロジェクト", "記憶"],
      }),
    );
    const results = index.search("プロジェクト");
    expect(results.length).toBeGreaterThan(0);
    const hit = results.find((r) => r.obsId === "obs_ja");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThan(0);
  });

  it("segments Korean (Hangul) syllable blocks into words", () => {
    index.add(
      makeObs({
        id: "obs_ko",
        title: "프로젝트 메모리 저장소",
        narrative: "한국어 검색을 테스트합니다",
        concepts: ["프로젝트", "메모리"],
      }),
    );
    const results = index.search("메모리");
    expect(results.length).toBeGreaterThan(0);
    const hit = results.find((r) => r.obsId === "obs_ko");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThan(0);
  });

  it("preserves source order across mixed CJK and non-CJK runs", () => {
    expect(segmentCjk("hello 项目 world")).toEqual(["hello", "项目", "world"]);
    expect(segmentCjk("abc 메모리 def 项目 ghi")).toEqual([
      "abc",
      "메모리",
      "def",
      "项目",
      "ghi",
    ]);
    expect(segmentCjk("leading 项目")).toEqual(["leading", "项目"]);
    expect(segmentCjk("项目 trailing")).toEqual(["项目", "trailing"]);
  });
});

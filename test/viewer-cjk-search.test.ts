import { describe, it, expect } from "vitest";

/**
 * Tests for the CJK-aware search routing logic used in the viewer.
 * These functions mirror the client-side helpers in src/viewer/index.html
 * to ensure backend search is triggered for CJK queries.
 */

// Mirror of the viewer's hasCjkChars function
function hasCjkChars(str: string): boolean {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(
    str,
  );
}

// Mirror of the viewer's shouldUseBackendSearch function
function shouldUseBackendSearch(query: string): boolean {
  if (!query || query.trim().length === 0) return false;
  if (hasCjkChars(query)) return true;
  return query.trim().length >= 3;
}

describe("Viewer CJK search routing", () => {
  describe("hasCjkChars", () => {
    it("detects Chinese characters", () => {
      expect(hasCjkChars("测试")).toBe(true);
      expect(hasCjkChars("项目记忆存储")).toBe(true);
      expect(hasCjkChars("hello 你好")).toBe(true);
    });

    it("detects Japanese hiragana and katakana", () => {
      expect(hasCjkChars("テスト")).toBe(true);
      expect(hasCjkChars("こんにちは")).toBe(true);
      expect(hasCjkChars("プロジェクト記憶")).toBe(true);
    });

    it("detects Korean hangul", () => {
      expect(hasCjkChars("메모리")).toBe(true);
      expect(hasCjkChars("한국어 검색")).toBe(true);
    });

    it("returns false for pure Latin text", () => {
      expect(hasCjkChars("hello world")).toBe(false);
      expect(hasCjkChars("auth middleware")).toBe(false);
      expect(hasCjkChars("JWT_TOKEN")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasCjkChars("")).toBe(false);
    });

    it("detects CJK punctuation and radicals", () => {
      expect(hasCjkChars("⺀")).toBe(true); // CJK radical
      expect(hasCjkChars("︰")).toBe(true); // CJK compatibility form
    });
  });

  describe("shouldUseBackendSearch", () => {
    it("returns false for empty or whitespace queries", () => {
      expect(shouldUseBackendSearch("")).toBe(false);
      expect(shouldUseBackendSearch("  ")).toBe(false);
      expect(shouldUseBackendSearch("   ")).toBe(false);
    });

    it("triggers backend search for any CJK character (even single char)", () => {
      expect(shouldUseBackendSearch("测")).toBe(true);
      expect(shouldUseBackendSearch("测试")).toBe(true);
      expect(shouldUseBackendSearch("项目记忆")).toBe(true);
    });

    it("triggers backend search for Japanese queries", () => {
      expect(shouldUseBackendSearch("テ")).toBe(true);
      expect(shouldUseBackendSearch("テスト")).toBe(true);
    });

    it("triggers backend search for Korean queries", () => {
      expect(shouldUseBackendSearch("메")).toBe(true);
      expect(shouldUseBackendSearch("메모리")).toBe(true);
    });

    it("triggers backend search for mixed CJK+Latin queries", () => {
      expect(shouldUseBackendSearch("auth 认证")).toBe(true);
      expect(shouldUseBackendSearch("JWT 验证中间件")).toBe(true);
    });

    it("uses local filter for short Latin queries (< 3 chars)", () => {
      expect(shouldUseBackendSearch("a")).toBe(false);
      expect(shouldUseBackendSearch("ab")).toBe(false);
    });

    it("triggers backend search for Latin queries >= 3 chars", () => {
      expect(shouldUseBackendSearch("auth")).toBe(true);
      expect(shouldUseBackendSearch("jwt")).toBe(true);
      expect(shouldUseBackendSearch("abc")).toBe(true);
    });
  });
});

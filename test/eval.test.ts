import { describe, it, expect } from "vitest";
import {
  ObserveInputSchema,
  CompressOutputSchema,
  SummaryOutputSchema,
  SearchInputSchema,
  ContextInputSchema,
  RememberInputSchema,
} from "../src/eval/schemas.js";
import { validateInput, validateOutput } from "../src/eval/validator.js";
import {
  scoreCompression,
  scoreSummary,
  scoreContextRelevance,
} from "../src/eval/quality.js";

describe("Zod Schemas", () => {
  describe("ObserveInputSchema", () => {
    it("accepts valid input", () => {
      const result = ObserveInputSchema.safeParse({
        hookType: "post_tool_use",
        sessionId: "ses_abc",
        project: "my-project",
        cwd: "/home/user",
        timestamp: "2026-01-01T00:00:00Z",
        data: { tool_name: "Read" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing sessionId", () => {
      const result = ObserveInputSchema.safeParse({
        hookType: "post_tool_use",
        project: "my-project",
        cwd: "/home/user",
        timestamp: "2026-01-01T00:00:00Z",
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid hookType", () => {
      const result = ObserveInputSchema.safeParse({
        hookType: "invalid_hook",
        sessionId: "ses_abc",
        project: "my-project",
        cwd: "/home/user",
        timestamp: "2026-01-01T00:00:00Z",
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CompressOutputSchema", () => {
    it("accepts valid output", () => {
      const result = CompressOutputSchema.safeParse({
        type: "file_edit",
        title: "Edit auth module",
        facts: ["Added JWT validation"],
        narrative: "Modified the auth middleware to validate tokens",
        concepts: ["auth"],
        files: ["src/auth.ts"],
        importance: 7,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty facts array", () => {
      const result = CompressOutputSchema.safeParse({
        type: "file_edit",
        title: "Edit auth module",
        facts: [],
        narrative: "Modified the auth middleware to validate tokens",
        concepts: [],
        files: [],
        importance: 5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects title over 120 chars", () => {
      const result = CompressOutputSchema.safeParse({
        type: "file_edit",
        title: "x".repeat(121),
        facts: ["fact"],
        narrative: "A narrative that is long enough",
        concepts: [],
        files: [],
        importance: 5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects importance outside 1-10", () => {
      const result = CompressOutputSchema.safeParse({
        type: "file_edit",
        title: "Test",
        facts: ["fact"],
        narrative: "A valid narrative here",
        concepts: [],
        files: [],
        importance: 11,
      });
      expect(result.success).toBe(false);
    });

    it("rejects narrative under 10 chars", () => {
      const result = CompressOutputSchema.safeParse({
        type: "file_edit",
        title: "Test",
        facts: ["fact"],
        narrative: "short",
        concepts: [],
        files: [],
        importance: 5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("SummaryOutputSchema", () => {
    it("accepts valid summary", () => {
      const result = SummaryOutputSchema.safeParse({
        title: "Session Summary",
        narrative: "This session focused on implementing authentication features and fixing bugs",
        keyDecisions: ["Use JWT"],
        filesModified: ["auth.ts"],
        concepts: ["auth"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects short narrative", () => {
      const result = SummaryOutputSchema.safeParse({
        title: "Summary",
        narrative: "Too short",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("SearchInputSchema", () => {
    it("accepts valid search", () => {
      expect(SearchInputSchema.safeParse({ query: "auth" }).success).toBe(true);
    });

    it("accepts search with limit", () => {
      expect(
        SearchInputSchema.safeParse({ query: "auth", limit: 10 }).success,
      ).toBe(true);
    });

    it("rejects empty query", () => {
      expect(SearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    });
  });

  describe("ContextInputSchema", () => {
    it("accepts valid input", () => {
      expect(
        ContextInputSchema.safeParse({
          sessionId: "ses_1",
          project: "proj",
        }).success,
      ).toBe(true);
    });
  });

  describe("RememberInputSchema", () => {
    it("accepts valid input", () => {
      expect(
        RememberInputSchema.safeParse({
          content: "Always use TypeScript",
          type: "preference",
        }).success,
      ).toBe(true);
    });

    it("rejects empty content", () => {
      expect(
        RememberInputSchema.safeParse({ content: "" }).success,
      ).toBe(false);
    });
  });
});

describe("Validator", () => {
  it("returns valid with correct data", () => {
    const result = validateInput(SearchInputSchema, { query: "test" }, "search");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.query).toBe("test");
    }
  });

  it("returns invalid with error details", () => {
    const result = validateInput(SearchInputSchema, { query: "" }, "search");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.result.functionId).toBe("search");
      expect(result.result.errors.length).toBeGreaterThan(0);
    }
  });

  it("validateOutput works same as validateInput", () => {
    const result = validateOutput(
      CompressOutputSchema,
      {
        type: "file_edit",
        title: "Test",
        facts: ["a"],
        narrative: "A long enough narrative",
        concepts: [],
        files: [],
        importance: 5,
      },
      "compress",
    );
    expect(result.valid).toBe(true);
  });
});

describe("Quality Scoring", () => {
  describe("scoreCompression", () => {
    it("returns 0 for empty object", () => {
      expect(scoreCompression({})).toBe(0);
    });

    it("returns 100 for perfect observation", () => {
      const score = scoreCompression({
        type: "file_edit",
        title: "A good title",
        facts: ["fact 1", "fact 2", "fact 3"],
        narrative: "A narrative that is definitely more than fifty characters long and provides good context",
        concepts: ["auth", "jwt"],
        importance: 7,
      });
      expect(score).toBe(100);
    });

    it("scores partial observations between 0 and 100", () => {
      const score = scoreCompression({
        title: "Test",
        facts: ["one"],
        narrative: "Short but valid narrative",
      });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });
  });

  describe("scoreSummary", () => {
    it("returns 0 for empty object", () => {
      expect(scoreSummary({})).toBe(0);
    });

    it("returns high score for complete summary", () => {
      const score = scoreSummary({
        title: "Session Summary Title",
        narrative:
          "This is a detailed narrative about what happened during the session with enough content to be meaningful and complete for review purposes",
        keyDecisions: ["Used JWT for auth", "Chose PostgreSQL"],
        filesModified: ["src/auth.ts", "src/db.ts"],
        concepts: ["authentication", "database"],
      });
      expect(score).toBeGreaterThanOrEqual(90);
    });
  });

  describe("scoreContextRelevance", () => {
    it("returns 0 for empty context", () => {
      expect(scoreContextRelevance("", "proj")).toBe(0);
    });

    it("scores higher when project is mentioned", () => {
      const withProject = scoreContextRelevance(
        "<context>This is for my-project with details</context>",
        "my-project",
      );
      const without = scoreContextRelevance(
        "<context>Some generic context details</context>",
        "my-project",
      );
      expect(withProject).toBeGreaterThan(without);
    });

    it("scores higher with more XML sections", () => {
      const multi = scoreContextRelevance(
        "<summary>A</summary><observations>B</observations><memories>C</memories><patterns>D</patterns>",
        "test",
      );
      const single = scoreContextRelevance("<summary>A</summary>", "test");
      expect(multi).toBeGreaterThan(single);
    });
  });
});

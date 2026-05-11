import { describe, expect, it } from "vitest";
import { SUMMARY_SYSTEM, buildSummaryPrompt } from "../src/prompts/summary.js";

describe("summary prompt", () => {
  it("defines required XML output shape", () => {
    expect(SUMMARY_SYSTEM).toContain("<summary>");
    expect(SUMMARY_SYSTEM).toContain("<title>Short session title");
    expect(SUMMARY_SYSTEM).toContain("<concept>key concept from session</concept>");
    expect(SUMMARY_SYSTEM).toContain("Output EXACTLY this XML format");
  });

  it("formats observations with numbering, facts, files, and separators", () => {
    const prompt = buildSummaryPrompt([
      {
        type: "file_edit",
        title: "Add auth tests",
        facts: ["Covered expired token", "Covered missing token"],
        narrative: "Added focused auth unit tests.",
        files: ["src/auth.ts", "test/auth.test.ts"],
        concepts: ["auth", "testing"],
      },
      {
        type: "command_run",
        title: "Run tests",
        facts: ["vitest passed"],
        narrative: "Validated local test suite.",
        files: [],
        concepts: ["validation"],
      },
    ]);

    expect(prompt).toContain("Session observations (2 total):");
    expect(prompt).toContain("[1] file_edit: Add auth tests");
    expect(prompt).toContain("  - Covered expired token");
    expect(prompt).toContain("Files: src/auth.ts, test/auth.test.ts");
    expect(prompt).toContain("---");
    expect(prompt).toContain("[2] command_run: Run tests");
  });

  it("handles empty observation lists", () => {
    expect(buildSummaryPrompt([])).toBe("Session observations (0 total):\n\n");
  });
});

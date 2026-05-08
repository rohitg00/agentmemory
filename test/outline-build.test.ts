import { describe, it, expect, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import {
  buildOutline,
  findNode,
  parseHeadings,
} from "../src/functions/outline-build.js";

describe("outline parser", () => {
  it("parses a simple flat doc", () => {
    const content = [
      "# Title",
      "intro line",
      "## Section A",
      "body a",
      "## Section B",
      "body b",
    ].join("\n");

    const o = buildOutline(content, "test.md", "2026-01-01T00:00:00Z", 100);
    expect(o.title).toBe("Title");
    expect(o.nodes).toHaveLength(1);
    expect(o.nodes[0].node_id).toBe("1");
    expect(o.nodes[0].children).toHaveLength(2);
    expect(o.nodes[0].children[0].node_id).toBe("1.1");
    expect(o.nodes[0].children[0].title).toBe("Section A");
    expect(o.nodes[0].children[0].line_start).toBe(3);
    expect(o.nodes[0].children[0].line_end).toBe(4);
    expect(o.nodes[0].children[1].node_id).toBe("1.2");
    expect(o.nodes[0].children[1].line_start).toBe(5);
    expect(o.nodes[0].children[1].line_end).toBe(6);
  });

  it("ignores headings inside fenced code blocks", () => {
    const content = [
      "# Real Title",
      "before",
      "```",
      "# fake heading",
      "## also fake",
      "```",
      "## Real Section",
      "body",
      "~~~bash",
      "# bash comment",
      "~~~",
      "## Other Section",
    ].join("\n");

    const headings = parseHeadings(content);
    expect(headings.map((h) => h.title)).toEqual([
      "Real Title",
      "Real Section",
      "Other Section",
    ]);

    const o = buildOutline(content, "code.md", "2026-01-01T00:00:00Z", 100);
    expect(o.nodes).toHaveLength(1);
    expect(o.nodes[0].children).toHaveLength(2);
    expect(o.nodes[0].children[0].title).toBe("Real Section");
    expect(o.nodes[0].children[1].title).toBe("Other Section");
  });

  it("handles 4 levels of nesting and correct line ranges", () => {
    const content = [
      "# H1",          // 1
      "x",             // 2
      "## H2",         // 3
      "y",             // 4
      "### H3",        // 5
      "z",             // 6
      "#### H4",       // 7
      "deep body",     // 8
      "deep more",     // 9
      "## H2 next",    // 10
      "tail",          // 11
    ].join("\n");

    const o = buildOutline(content, "deep.md", "2026-01-01T00:00:00Z", 100);
    expect(o.nodes).toHaveLength(1);

    const h1 = o.nodes[0];
    expect(h1.node_id).toBe("1");
    expect(h1.line_start).toBe(1);
    expect(h1.line_end).toBe(11);
    expect(h1.children).toHaveLength(2);

    const h2a = h1.children[0];
    expect(h2a.node_id).toBe("1.1");
    expect(h2a.line_end).toBe(9);
    expect(h2a.children).toHaveLength(1);

    const h3 = h2a.children[0];
    expect(h3.node_id).toBe("1.1.1");
    expect(h3.line_start).toBe(5);
    expect(h3.line_end).toBe(9);
    expect(h3.children).toHaveLength(1);

    const h4 = h3.children[0];
    expect(h4.node_id).toBe("1.1.1.1");
    expect(h4.title).toBe("H4");
    expect(h4.line_start).toBe(7);
    expect(h4.line_end).toBe(9);

    const h2b = h1.children[1];
    expect(h2b.node_id).toBe("1.2");
    expect(h2b.title).toBe("H2 next");
    expect(h2b.line_start).toBe(10);
    expect(h2b.line_end).toBe(11);
  });

  it("findNode walks DFS across all levels", () => {
    const content = "# A\n## B\n### C\n## D";
    const o = buildOutline(content, "dfs.md", "2026-01-01T00:00:00Z", 100);
    expect(findNode(o.nodes, "1")?.title).toBe("A");
    expect(findNode(o.nodes, "1.1")?.title).toBe("B");
    expect(findNode(o.nodes, "1.1.1")?.title).toBe("C");
    expect(findNode(o.nodes, "1.2")?.title).toBe("D");
    expect(findNode(o.nodes, "9.9.9")).toBeNull();
  });

  it("falls back to filename when no headings", () => {
    const o = buildOutline(
      "no headings here\njust text",
      "/tmp/notes.md",
      "2026-01-01T00:00:00Z",
      20,
    );
    expect(o.title).toBe("notes.md");
    expect(o.nodes).toHaveLength(0);
  });

  it("supports two H1 siblings", () => {
    const content = ["# First", "x", "# Second", "y"].join("\n");
    const o = buildOutline(content, "two.md", "2026-01-01T00:00:00Z", 30);
    expect(o.nodes).toHaveLength(2);
    expect(o.nodes[0].node_id).toBe("1");
    expect(o.nodes[1].node_id).toBe("2");
    expect(o.nodes[0].line_end).toBe(2);
    expect(o.nodes[1].line_end).toBe(4);
  });
});

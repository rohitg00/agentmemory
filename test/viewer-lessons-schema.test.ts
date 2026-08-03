import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("viewer structured lesson projection", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");
  const helpersStart = viewer.indexOf("    function lessonFacetEntries(");
  const helpersEnd = viewer.indexOf("\n    function formatTime(", helpersStart);
  const helperSource = viewer.slice(helpersStart, helpersEnd);
  const escapeHtml = (value: unknown): string =>
    value
      ? String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
      : "";
  const renderLessonFacets = new Function(
    "esc",
    `${helperSource}\nreturn renderLessonFacets;`,
  )(escapeHtml) as (facets?: Record<string, unknown>) => string;

  it("searches canonical claim, verdict, lifecycle, scope, sensitivity, flags, and facets", () => {
    expect(viewer).toContain("l.claim");
    expect(viewer).toContain("l.evidenceVerdict");
    expect(viewer).toContain("l.lifecycle");
    expect(viewer).toContain("scope.scopeId");
    expect(viewer).toContain("l.sensitivity");
    expect(viewer).toContain("flags.stale ? 'stale' : ''");
    expect(viewer).toContain("flags.contradicted ? 'contradicted' : ''");
    expect(viewer).toContain("lessonFacetEntries(l.structuredFacets)");
  });

  it("renders structured evidence state, lifecycle, scope, sensitivity, and computed flags", () => {
    expect(viewer).toContain("<strong>Claim:</strong>");
    expect(viewer).toContain("var verdict = l.evidenceVerdict || 'unverified'");
    expect(viewer).toContain("var lifecycle = l.lifecycle || 'active'");
    expect(viewer).toContain("sensitivity: ");
    expect(viewer).toContain(">contradicted</span>");
    expect(viewer).toContain(">stale</span>");
  });

  it("renders multiple structured facet entries visibly, deterministically, and escaped", () => {
    const markup = renderLessonFacets({
      signal_family: ["mean_reversion", "<breakout&retest>"],
      asset: ["ETH", "BTC"],
    });

    expect(viewer).toMatch(
      /html \+= renderLessonFacets\(l\.structuredFacets\);\s*html \+= '<\/td>';/,
    );
    expect(markup).toContain('class="lesson-facets"');
    expect(markup).toContain(">Facets:</span>");
    expect(markup).not.toContain("<breakout&retest>");
    expect(markup).toContain(
      "signal_family: &lt;breakout&amp;retest&gt;",
    );
    expect(markup.indexOf("asset: BTC")).toBeLessThan(
      markup.indexOf("asset: ETH"),
    );
    expect(markup.indexOf("asset: ETH")).toBeLessThan(
      markup.indexOf("signal_family: &lt;breakout&amp;retest&gt;"),
    );
    expect(
      markup.indexOf("signal_family: &lt;breakout&amp;retest&gt;"),
    ).toBeLessThan(markup.indexOf("signal_family: mean_reversion"));
  });

  it("omits the visible facet field for absent or empty facets", () => {
    expect(renderLessonFacets()).toBe("");
    expect(renderLessonFacets({})).toBe("");
    expect(
      renderLessonFacets({
        signal_family: [],
        venue: undefined,
        regime: [undefined, null, ""],
      }),
    ).toBe("");
    expect(
      [
        renderLessonFacets(),
        renderLessonFacets({}),
        renderLessonFacets({ venue: undefined }),
      ].join(""),
    ).not.toContain("undefined");
  });
});

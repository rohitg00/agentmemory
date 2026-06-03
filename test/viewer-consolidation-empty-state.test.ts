import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

describe("viewer consolidation empty states", () => {
  it("explains input gates and sources for empty consolidation tiers", () => {
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    const { html } = rendered;

    expect(html).toContain("Semantic facts are waiting for enough summaries");
    expect(html).toContain(">= 5 summaries");
    expect(html).toContain("Current sessions");

    expect(html).toContain("Procedures are waiting for repeated patterns");
    expect(html).toContain("patterns seen in 2+ sessions");

    expect(html).toContain("Insights are waiting for enough signals");

    expect(html).toContain("Lessons require an explicit save");
    expect(html).toContain("mem::lesson-save");

    expect(html).toContain("Crystals come from crystallize actions");
    expect(html).toContain("mem::auto-crystallize");

    expect(html).toContain("This is an input gate, not a broken tab");
  });
});

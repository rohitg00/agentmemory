import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("viewer structured lesson projection", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("searches canonical claim, verdict, lifecycle, scope, sensitivity, flags, and facets", () => {
    expect(viewer).toContain("l.claim");
    expect(viewer).toContain("l.evidenceVerdict");
    expect(viewer).toContain("l.lifecycle");
    expect(viewer).toContain("scope.scopeId");
    expect(viewer).toContain("l.sensitivity");
    expect(viewer).toContain("flags.stale ? 'stale' : ''");
    expect(viewer).toContain("flags.contradicted ? 'contradicted' : ''");
    expect(viewer).toContain("l.structuredFacets || {}");
  });

  it("renders structured evidence state, lifecycle, scope, sensitivity, and computed flags", () => {
    expect(viewer).toContain("<strong>Claim:</strong>");
    expect(viewer).toContain("var verdict = l.evidenceVerdict || 'unverified'");
    expect(viewer).toContain("var lifecycle = l.lifecycle || 'active'");
    expect(viewer).toContain("sensitivity: ");
    expect(viewer).toContain(">contradicted</span>");
    expect(viewer).toContain(">stale</span>");
  });
});

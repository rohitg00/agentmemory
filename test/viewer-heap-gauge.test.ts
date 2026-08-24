import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The dashboard used to recompute heapUsed / heapTotal client-side, which is
// the same over-reporting the health thresholds had: heapTotal is what V8 has
// committed, not what it may grow to. The gauge now measures against
// heapSizeLimit, and it divides raw byte values so it cannot disagree with
// evaluateHealth over a rounding step.
//
// Asserting on the emitted source rather than running the gauge follows
// viewer-graph-cooldown and viewer-memories-sort: the viewer ships as one
// HTML file with inline JS, so there is no module to import and execute.
describe("viewer heap gauge", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("measures against the V8 heap limit, falling back to heapTotal", () => {
    expect(viewer).toMatch(/limitBytes\s*=\s*snap\.memory\.heapSizeLimit\s*\|\|\s*0/);
    expect(viewer).toMatch(
      /ceilingBytes\s*=\s*limitBytes\s*>\s*0\s*\?\s*limitBytes\s*:\s*\(snap\.memory\.heapTotal\s*\|\|\s*0\)/,
    );
  });

  it("computes the percentage from raw bytes, not the MB-rounded label values", () => {
    expect(viewer).toMatch(
      /heapPercent\s*=\s*ceilingBytes\s*>\s*0\s*\?\s*\(\(snap\.memory\.heapUsed\s*\|\|\s*0\)\s*\/\s*ceilingBytes\)\s*\*\s*100/,
    );
    // The old form divided two already-rounded MB numbers.
    expect(viewer).not.toMatch(/heapPct\s*=\s*heapTotal\s*>\s*0\s*\?\s*Math\.round\(\(heapUsed\s*\/\s*heapTotal\)/);
  });

  it("picks the gauge colour on the unrounded percentage", () => {
    // Rounding first put the gauge a whole point out of step with
    // evaluateHealth, which compares the raw value: at 80.4% health warns
    // while a rounded 80 left the bar on the lower colour.
    expect(viewer).toMatch(/heapPct\s*=\s*Math\.round\(heapPercent\)/);
    expect(viewer).toMatch(/heapColor\s*=\s*\(heapPercent\s*>\s*80\s*&&\s*rssAboveFloor\)/);
    expect(viewer).toMatch(/\(heapPercent\s*>\s*60\s*&&\s*rssAboveFloor\)/);
  });

  it("rounds only for the displayed label", () => {
    expect(viewer).toMatch(/heapCeiling\s*=\s*Math\.round\(ceilingBytes\s*\/\s*1024\s*\/\s*1024\)/);
    expect(viewer).toMatch(/\+\s*heapUsed\s*\+\s*' \/ '\s*\+\s*heapCeiling\s*\+\s*' MB/);
  });
});

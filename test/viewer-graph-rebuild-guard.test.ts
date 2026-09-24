import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// #1383: graph/build is not an incremental refresh - it walks every session's
// observations and re-extracts, minutes of work on a large corpus. The button
// used to fire it on a single click with no confirmation, no in-flight guard,
// and no handling of the response (api() resolves to null on a non-2xx, so a
// failed build was indistinguishable from one that found nothing).
describe("viewer graph rebuild guard", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("confirms before firing the corpus-scale replay", () => {
    expect(viewer).toMatch(/if \(!window\.confirm\(question\)\) return;/);
  });

  it("states the known corpus size in the confirmation", () => {
    expect(viewer).toMatch(/This replays ' \+ known \+ ' known nodes/);
  });

  it("refuses a second rebuild while one is in flight", () => {
    expect(viewer).toMatch(/var rebuildInFlight = false;/);
    expect(viewer).toMatch(/if \(rebuildInFlight\) return;/);
    expect(viewer).toMatch(/rebuildInFlight = true;/);
    expect(viewer).toMatch(/rebuildInFlight = false;/);
  });

  it("disables the rebuild buttons while a run is active", () => {
    expect(viewer).toMatch(/setRebuildButtonsDisabled\(true\);/);
    expect(viewer).toMatch(/setRebuildButtonsDisabled\(false\);/);
    expect(viewer).toMatch(/querySelectorAll\('\[data-action="rebuild-graph"\]'\)/);
  });

  it("checks the build result instead of refreshing unconditionally", () => {
    expect(viewer).toMatch(/var result = await apiPost\('graph\/build', \{\}\);/);
    expect(viewer).toMatch(/if \(result && result\.success\)/);
    expect(viewer).toMatch(/state\.graph\.loaded = false;/);
  });

  it("renders a retryable failure into the sidebar", () => {
    expect(viewer).toMatch(/Rebuild failed: /);
    expect(viewer).toMatch(/graphRebuildStatus/);
    expect(viewer).toMatch(/data-action="rebuild-graph">Retry<\/button>/);
  });

  it("escapes the failure text instead of inlining it", () => {
    expect(viewer).toMatch(/esc\(text\)/);
  });
});

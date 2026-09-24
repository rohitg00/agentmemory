import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Safari web viewer CPU/RAM optimization", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("registers visibilitychange listener to pause/resume graph and dither loop", () => {
    expect(viewer).toMatch(/document\.addEventListener\(['"]visibilitychange['"]/);
    expect(viewer).toMatch(/if\s*\(document\.hidden\)\s*\{/);
    expect(viewer).toMatch(/cancelAnimationFrame\(graphSim\.raf\)/);
    expect(viewer).toMatch(/graphSim\.raf\s*=\s*null/);
    expect(viewer).toMatch(/stopDitherLoop\(\)/);
    expect(viewer).toMatch(/startDitherLoop\(\)/);
    expect(viewer).toMatch(/if\s*\(state\.activeTab\s*===\s*['"]graph['"]\)/);
    expect(viewer).toMatch(/wakeGraphSim\(\)/);
    expect(viewer).toMatch(/renderGraph\(\)/);
  });

  it("pauses graph animation frame when switching away from graph tab and resumes on graph tab", () => {
    expect(viewer).toMatch(/if\s*\(tab\s*!==\s*['"]graph['"]\s*&&\s*graphSim\.raf\)\s*\{/);
    expect(viewer).toMatch(/if\s*\(tab\s*===\s*['"]graph['"]\)\s*\{/);
  });

  it("checks document.hidden in dashboardTimer and pollTimer", () => {
    expect(viewer).toMatch(/dashboardTimer\s*=\s*setInterval\(function\(\)\s*\{\s*if\s*\(document\.hidden\)\s*return;/);
    expect(viewer).toMatch(/pollTimer\s*=\s*setInterval\(function\(\)\s*\{\s*if\s*\(document\.hidden\)\s*return;/);
  });

  it("refactors dither loop with startDitherLoop/stopDitherLoop helper and ~120ms interval", () => {
    expect(viewer).toMatch(/startDitherLoop\s*=\s*function/);
    expect(viewer).toMatch(/stopDitherLoop\s*=\s*function/);
    expect(viewer).toMatch(/setInterval\(function\s*\(\)\s*\{\s*t\+\+;\s*draw\(\);\s*\},\s*120\)/);
  });
});

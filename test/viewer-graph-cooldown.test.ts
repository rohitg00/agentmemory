import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// viewer graph kept bouncing on >1000 nodes because damping
// alone could not bleed off the per-frame force pile-up. Cool-down
// adds tick-decayed damping, a per-node velocity cap, and parks the
// raf loop when total kinetic energy drops below an epsilon.
describe("viewer graph cool-down", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("tracks a tickCount that grows each simulation step", () => {
    expect(viewer).toMatch(/graphSim\.tickCount\s*=\s*\(graphSim\.tickCount\s*\|\|\s*0\)\s*\+\s*1/);
  });

  it("adds tick-decay to damping (coolBoost scales with tickCount)", () => {
    expect(viewer).toMatch(/coolBoost\s*=\s*Math\.min\(0\.4,\s*graphSim\.tickCount\s*\/\s*1500\)/);
    expect(viewer).toMatch(/damping\s*=\s*0\.9\s*-\s*coolBoost/);
  });

  it("caps per-node velocity by node-count band", () => {
    expect(viewer).toMatch(
      /velocityCap\s*=\s*nodeCount\s*>\s*1000\s*\?\s*6/,
    );
    expect(viewer).toMatch(/nvx\s*>\s*velocityCap/);
    expect(viewer).toMatch(/nvy\s*>\s*velocityCap/);
  });

  it("parks the raf loop once the layout is quiet for 30 ticks", () => {
    expect(viewer).toMatch(/rmsVelocity/);
    expect(viewer).toMatch(/quietTicks/);
    expect(viewer).toMatch(/if\s*\(graphSim\.quietTicks\s*>\s*30\)/);
  });

  it("wakes the parked loop on mousedown so drag still responds", () => {
    expect(viewer).toMatch(/graphSim\.quietTicks\s*=\s*0/);
    expect(viewer).toMatch(/if\s*\(graphSim\.running\s*&&\s*!graphSim\.raf\)/);
  });
});

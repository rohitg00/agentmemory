import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("viewer graph layout and rendering", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("settles the first layout in a bounded loop before drawing", () => {
    expect(viewer).toMatch(/for \(var i = 0; i < 320 && graphSim\.alpha > 0\.004; i\+\+\) graphTick\(\);/);
  });

  it("cools the simulation and caps per-node speed", () => {
    expect(viewer).toMatch(/graphSim\.alpha \*= 0\.975;/);
    expect(viewer).toMatch(/if \(sp > 30\) \{ s\.vx \*= 30 \/ sp; s\.vy \*= 30 \/ sp; \}/);
  });

  it("stops the animation frame loop once the layout is cool", () => {
    expect(viewer).toMatch(/if \(graphSim\.alpha > 0\.01 \|\| graphSim\.drag\) graphSim\.raf = requestAnimationFrame\(graphFrame\);/);
  });

  it("draws crisp: device pixel ratio transform and no canvas blur", () => {
    expect(viewer).toMatch(/canvas\.width = Math\.round\(w \* dpr\);/);
    expect(viewer).toMatch(/ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\);/);
    expect(viewer).not.toMatch(/shadowBlur/);
  });

  it("labels nodes at rest by degree with collision checks", () => {
    expect(viewer).toMatch(/graphDegree\(q\.id\) - graphDegree\(p\.id\)/);
    expect(viewer).toMatch(/if \(strong \|\| free\(rect\)\) \{ spot = rect; break; \}/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A second full instance next to a live daemon registers a duplicate worker
// on the running engine, and on iii 0.11.2 its shutdown tears down the
// daemon's HTTP trigger routing (every /agentmemory/* route 404s until a full
// engine restart). Two guards prevent that: unknown subcommands error instead
// of falling through to the server boot, and the boot path probes livez and
// refuses when a live daemon already answers on the resolved port.
describe("CLI second-instance guards (#1140)", () => {
  const src = readFileSync("src/cli.ts", "utf-8");

  it("unknown subcommands do not fall through to the server boot", () => {
    expect(src).toContain("async function unknownCommand()");
    expect(src).toMatch(
      /const handler = commands\[first\] \?\? \(first && !first\.startsWith\("-"\) \? unknownCommand : main\)/,
    );
  });

  it("main() probes livez and refuses to boot over a live daemon", () => {
    const mainBody = src.slice(src.indexOf("async function main()"));
    const probeIdx = mainBody.indexOf("/agentmemory/livez");
    expect(probeIdx).toBeGreaterThan(-1);
    // The probe must run before the engine/worker boot path.
    const bootIdx = mainBody.indexOf("startEngine");
    expect(probeIdx).toBeLessThan(bootIdx);
    expect(mainBody).toContain("already running on port");
  });
});

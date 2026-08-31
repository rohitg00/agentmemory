import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// #640 + #474: stop must also kill the worker process, not just the
// iii engine. We expose the worker pidfile from src/index.ts and read it
// from src/cli.ts. Static check that both files use the resolved runtime
// metadata directory and that stop reads it.
describe("stop reaps the worker process (#640, #474)", () => {
  it("src/index.ts writes worker.pid alongside iii.pid", () => {
    const source = readFileSync("src/index.ts", "utf-8");
    expect(source).toMatch(/workerPidfilePath\(\)/);
    expect(source).toMatch(/"worker\.pid"/);
    expect(source).toMatch(/writeWorkerPidfile\(\)/);
    expect(source).toMatch(/clearWorkerPidfile\(\)/);
  });

  it("src/cli.ts reads worker.pid in runStop and signals it on stop", () => {
    const source = readFileSync("src/cli.ts", "utf-8");
    expect(source).toMatch(/workerPidfilePath\(\)/);
    expect(source).toMatch(/"worker\.pid"/);
    expect(source).toMatch(/readWorkerPidfile\(\)/);
    expect(source).toMatch(/clearWorkerPidfile\(\)/);
    // Verify stop wiring: workerCandidates set is built from the pidfile
    // and signaled alongside the engine pids.
    expect(source).toMatch(/workerCandidates/);
    expect(source).toMatch(/Stopping agentmemory worker/);
  });

  it("both files agree on the instance-scoped worker pidfile", () => {
    const indexSrc = readFileSync("src/index.ts", "utf-8");
    const cliSrc = readFileSync("src/cli.ts", "utf-8");
    expect(indexSrc).toContain('runtimeMetadataPath("worker.pid")');
    expect(cliSrc).toContain('runtimeMetadataPath("worker.pid")');
  });

  it("validates Docker ownership and flushes the worker before stopping the container", () => {
    const source = readFileSync("src/cli.ts", "utf-8");
    const start = source.indexOf("async function stopDockerEngine");
    const end = source.indexOf("async function runStop", start);
    const body = source.slice(start, end);

    expect(body.indexOf("inspectOwnedDockerEngine(state)"))
      .toBeLessThan(body.indexOf("readWorkerPidfile()"));
    expect(body.indexOf("readWorkerPidfile()"))
      .toBeLessThan(body.indexOf('["stop", "--time", "10", inspection.containerId]'));
    expect(body).toContain("persistDockerInspection(state, inspection)");
    expect(body).toContain("writeEngineState(resolvedState)");
  });
});

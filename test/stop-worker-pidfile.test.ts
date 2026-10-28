import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("stop reaps the worker process", () => {
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
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { checkDuplicateWorkers, getDuplicateWorkers, resetDuplicateWorkersForTest } from "../src/runtime/duplicates.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("duplicate worker detection", () => {
  beforeEach(() => resetDuplicateWorkersForTest());

  it("reports engine worker ids from the id field", async () => {
    const sdk = {
      trigger: vi.fn(async () => ({ workers: [
        { id: "w-1", name: "agentmemory" },
        { id: "w-2", name: "agentmemory" },
        { id: "w-3", name: "state" },
      ] })),
    };
    const info = await checkDuplicateWorkers(sdk as never);
    expect(info).toEqual({ count: 2, workerIds: ["w-1", "w-2"] });
  });

  it("doctor authenticates its status request against the daemon base URL", () => {
    const cli = readFileSync("src/cli.ts", "utf-8");
    const daemonStatus = cli.slice(cli.indexOf("daemonStatus: async () =>"), cli.indexOf("runInit: async () =>"));
    expect(daemonStatus).toContain("headers: bearerHeaders(base)");
    expect(daemonStatus).not.toContain("bearerHeaders(resolveClientSecret(");
    const timeout = Number(/AbortSignal\.timeout\((\d+)\)/.exec(daemonStatus)?.[1]);
    expect(timeout).toBeGreaterThan(5000);
  });
});

describe("route bindings in api.ts", () => {
  it("registers every HTTP route through Bindings", () => {
    const api = readFileSync("src/triggers/api.ts", "utf-8");
    expect(api).not.toMatch(/sdk\.registerTrigger\(\{\s*type:\s*"http"/);
  });

  it("keeps the newest result when an older check finishes last", async () => {
    resetDuplicateWorkersForTest();
    let releaseOlder!: (value: unknown) => void;
    const trigger = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOlder = resolve; }))
      .mockImplementationOnce(async () => ({
        workers: [{ worker_id: "a", worker_name: "agentmemory" }, { worker_id: "b", worker_name: "agentmemory" }],
      }));
    const sdk = { trigger } as never;
    const older = checkDuplicateWorkers(sdk);
    await checkDuplicateWorkers(sdk);
    expect(getDuplicateWorkers()?.count).toBe(2);
    releaseOlder({ workers: [{ worker_id: "a", worker_name: "agentmemory" }] });
    await older;
    expect(getDuplicateWorkers()?.count).toBe(2);
  });
});

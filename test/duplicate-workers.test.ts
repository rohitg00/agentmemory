import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { checkDuplicateWorkers, resetDuplicateWorkersForTest } from "../src/runtime/duplicates.js";

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
  });
});

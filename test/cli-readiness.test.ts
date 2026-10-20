import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  configStartsAgentmemoryWorker,
  probeEngine,
  probeWorker,
  startWorkerAndWait,
  startupDeadline,
  startupTimeoutMessage,
  startupTimeouts,
  waitForReadiness,
  withinStartupDeadline,
} from "../src/cli/readiness.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fakeTime(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
}

async function advance<T>(promise: Promise<T>, ms: number): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

const forever = <T>(): Promise<T> => new Promise(() => {});

function workerOptions(overrides: Partial<Parameters<typeof startWorkerAndWait>[0]> = {}) {
  return {
    timeoutMs: 1000,
    hasLiveWorker: () => false,
    engineStartsWorker: () => false,
    startWorker: vi.fn(async () => {}),
    probe: vi.fn(async () => true),
    ...overrides,
  };
}

describe("startup configuration", () => {
  it("uses separate bounded engine and worker defaults", () => {
    expect(startupTimeouts({})).toEqual({ engineMs: 120_000, workerMs: 300_000, engineManagesWorker: undefined });
  });

  it("reads runtime values on each call, including both boundaries", () => {
    const env = { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "1", AGENTMEMORY_READY_TIMEOUT_MS: "3600000" };
    expect(startupTimeouts(env)).toMatchObject({ engineMs: 1, workerMs: 3_600_000 });
    env.AGENTMEMORY_ENGINE_READY_TIMEOUT_MS = "48000";
    expect(startupTimeouts(env).engineMs).toBe(48_000);
  });

  it.each(["", " ", "0", "-1", "1.5", "15s", "12abc", "1e3", "NaN", "Infinity", "3600001", "9007199254740993"])("rejects invalid timeout %j for either phase", (value) => {
    for (const key of ["AGENTMEMORY_ENGINE_READY_TIMEOUT_MS", "AGENTMEMORY_READY_TIMEOUT_MS"]) {
      expect(() => startupTimeouts({ [key]: value })).toThrow(`${key} must be an integer`);
    }
  });

  it("accepts explicit worker ownership and rejects ambiguous boolean values", () => {
    expect(startupTimeouts({ AGENTMEMORY_ENGINE_MANAGES_WORKER: "true" }).engineManagesWorker).toBe(true);
    expect(startupTimeouts({ AGENTMEMORY_ENGINE_MANAGES_WORKER: "false" }).engineManagesWorker).toBe(false);
    for (const value of ["", "1", "yes", "TRUE"]) {
      expect(() => startupTimeouts({ AGENTMEMORY_ENGINE_MANAGES_WORKER: value })).toThrow("must be true or false");
    }
  });

  it("reports the configured duration and correct setting in failures", () => {
    expect(startupTimeoutMessage("worker", 48_050)).toContain("48.05s. Set AGENTMEMORY_READY_TIMEOUT_MS");
    expect(startupTimeoutMessage("engine", 120_000)).toContain("120s. Set AGENTMEMORY_ENGINE_READY_TIMEOUT_MS");
  });
});

describe("configured worker ownership", () => {
  const config = (command: string) => `workers:\n  - name: iii-exec\n    config:\n      exec:\n        - ${command}\n  - name: iii-http\n    config:\n      port: 3111\n`;
  let engineCwd: string;
  let emptyCwd: string;
  let distOnlyCwd: string;
  let dirEntryCwd: string;
  let linkCwd: string;
  beforeAll(() => {
    engineCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-"));
    emptyCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-empty-"));
    mkdirSync(join(emptyCwd, "dist"));
    mkdirSync(join(emptyCwd, "src"));
    distOnlyCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-dist-"));
    mkdirSync(join(distOnlyCwd, "dist"));
    writeFileSync(join(distOnlyCwd, "dist/index.mjs"), "");
    dirEntryCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-dir-"));
    mkdirSync(join(dirEntryCwd, "dist/index.mjs"), { recursive: true });
    mkdirSync(join(dirEntryCwd, "src/index.ts"), { recursive: true });
    linkCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-link-"));
    mkdirSync(join(linkCwd, "dist"));
    mkdirSync(join(linkCwd, "src"));
    writeFileSync(join(linkCwd, "target.mjs"), "");
    symlinkSync(join(linkCwd, "target.mjs"), join(linkCwd, "dist/index.mjs"));
    symlinkSync(join(linkCwd, "src"), join(linkCwd, "src/index.ts"));
    for (const entry of ["dist/index.mjs", "src/index.ts", "other.mjs", "delayed-wrapper.mjs"]) {
      mkdirSync(dirname(join(engineCwd, entry)), { recursive: true });
      writeFileSync(join(engineCwd, entry), "");
    }
  });
  afterAll(() => {
    rmSync(engineCwd, { recursive: true, force: true });
    rmSync(emptyCwd, { recursive: true, force: true });
    rmSync(distOnlyCwd, { recursive: true, force: true });
    rmSync(dirEntryCwd, { recursive: true, force: true });
    rmSync(linkCwd, { recursive: true, force: true });
  });
  it.each(["node dist/index.mjs", "node ./dist/index.mjs", "node --import tsx src/index.ts", "tsx ./src/index.ts", '"node dist/index.mjs"', "node dist/index.mjs # worker", '"node dist/index.mjs" # worker', "node --max-old-space-size=8192 dist/index.mjs", '\'/opt/node /package/dist/index.mjs\''])("recognizes a direct worker command: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs", engineCwd)).toBe(true);
  });
  it.each(["node other.mjs", "node delayed-wrapper.mjs", "echo node dist/index.mjs", "sh -c 'node dist/index.mjs'", "node dist/index.mjs && something", "node dist/index.mjs.fake"])("does not claim unrelated or wrapped command: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs", engineCwd)).toBe(false);
  });
  it.each(["node dist/index.mjs", "node ./dist/index.mjs", "node --import tsx src/index.ts", "tsx ./src/index.ts"])("does not claim a relative worker entry missing from the engine working directory: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs", emptyCwd)).toBe(false);
  });
  it.each(["node dist/index.mjs", "node ./dist/index.mjs", "node --import tsx src/index.ts", "tsx ./src/index.ts"])("does not claim a relative worker entry that is a directory in the engine working directory: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs", dirEntryCwd)).toBe(false);
  });
  it("follows a symlinked relative worker entry to what it points at", () => {
    expect(configStartsAgentmemoryWorker(config("node dist/index.mjs"), "/package/dist/index.mjs", linkCwd)).toBe(true);
    expect(configStartsAgentmemoryWorker(config("tsx ./src/index.ts"), "/package/dist/index.mjs", linkCwd)).toBe(false);
  });
  it("treats an unreadable relative worker entry as missing and keeps reading the exec list", () => {
    const raw = `workers:\n  - name: iii-exec\n    config:\n      exec:\n        - node dist/index.mjs\n        - /opt/node /package/dist/index.mjs\n`;
    const loopCwd = mkdtempSync(join(tmpdir(), "am-engine-cwd-loop-"));
    try {
      mkdirSync(join(loopCwd, "dist"));
      symlinkSync(join(loopCwd, "dist/index.mjs"), join(loopCwd, "dist/index.mjs"));
      expect(configStartsAgentmemoryWorker(raw, "/package/dist/index.mjs", loopCwd)).toBe(true);
      expect(configStartsAgentmemoryWorker(config("node dist/index.mjs"), "/package/dist/index.mjs", loopCwd)).toBe(false);
    } finally {
      rmSync(loopCwd, { recursive: true, force: true });
    }
  });
  it.each(["node --import tsx src/index.ts", "tsx ./src/index.ts"])("does not claim the source entry when only the built entry exists in the engine working directory: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs", distOnlyCwd)).toBe(false);
  });
  it("recognizes the absolute worker entry without an engine working directory", () => {
    expect(configStartsAgentmemoryWorker(config("/opt/node /package/dist/index.mjs"), "/package/dist/index.mjs")).toBe(true);
  });
  it.each(["node dist/index.mjs", "node ./dist/index.mjs", "node --import tsx src/index.ts", "tsx ./src/index.ts"])("keeps recognizing a relative worker entry when the engine working directory is unknown: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs")).toBe(true);
  });
  it.each(["node other.mjs", "sh -c 'node dist/index.mjs'"])("does not claim an unrelated entry when the engine working directory is unknown: %s", (command) => {
    expect(configStartsAgentmemoryWorker(config(command), "/package/dist/index.mjs")).toBe(false);
  });
  it("ignores comments, other workers and sibling configuration lists", () => {
    const raw = `# - name: iii-exec\n#   exec:\n#     - node dist/index.mjs\n  - name: iii-state\n    config:\n      exec:\n        - node dist/index.mjs\n  - name: iii-exec\n    config:\n      exec:\n        - node other.mjs\n      watch:\n        - node dist/index.mjs\n`;
    expect(configStartsAgentmemoryWorker(raw, "/package/dist/index.mjs", engineCwd)).toBe(false);
  });
});

describe("readiness deadlines", () => {
  it("aborts a hung probe at the remaining budget, without a trailing retry sleep", async () => {
    fakeTime();
    let signal: AbortSignal | undefined;
    const probe = vi.fn(async (value: AbortSignal) => { signal = value; return forever<boolean>(); });
    const pending = waitForReadiness(startupDeadline(25), probe);
    expect(await advance(pending, 25)).toBe(false);
    expect(performance.now()).toBe(25);
    expect(signal?.aborted).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps individual probes and keeps retries within the total budget", async () => {
    fakeTime();
    const probe = vi.fn(() => forever<boolean>());
    expect(await advance(waitForReadiness(startupDeadline(3000), probe), 3000)).toBe(false);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(performance.now()).toBe(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes response body consumption in the probe budget", async () => {
    fakeTime();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => forever() })));
    const pending = waitForReadiness(startupDeadline(25), (signal) => probeWorker("http://local", signal));
    expect(await advance(pending, 25)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries errors and malformed responses before accepting viewerSkipped", async () => {
    fakeTime();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response("not json"))
      .mockResolvedValueOnce(Response.json({ viewerSkipped: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await advance(waitForReadiness(startupDeadline(1000), (signal) => probeWorker("http://local", signal)), 500)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts readiness just before the deadline", async () => {
    fakeTime();
    const pending = waitForReadiness(startupDeadline(100), async () => new Promise((resolve) => setTimeout(() => resolve(true), 99)));
    expect(await advance(pending, 99)).toBe(true);
  });

  it("rejects readiness at or after the deadline even when the probe ignores abort", async () => {
    fakeTime();
    const pending = waitForReadiness(startupDeadline(100), async () => new Promise((resolve) => setTimeout(() => resolve(true), 100)));
    expect(await advance(pending, 100)).toBe(false);
  });

  it("rejects late success after synchronous work exhausts the deadline", async () => {
    const remaining = vi.fn().mockReturnValueOnce(5).mockReturnValue(0);
    const result = await withinStartupDeadline({ remaining }, async () => true);
    expect(result.completed).toBe(false);
  });

  it("does not let wall-clock changes extend startup", async () => {
    fakeTime();
    const pending = waitForReadiness(startupDeadline(25), () => forever<boolean>());
    vi.setSystemTime(new Date("1999-01-01"));
    expect(await advance(pending, 25)).toBe(false);
  });

  it("stops retrying after a known engine exit, including during a successful probe", async () => {
    let stopped = false;
    const probe = vi.fn(async () => { stopped = true; return true; });
    expect(await waitForReadiness(startupDeadline(1000), probe, { stopped: () => stopped })).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("does not start a probe after expiry or a known failure", async () => {
    const probe = vi.fn(async () => true);
    expect(await waitForReadiness(startupDeadline(0), probe)).toBe(false);
    expect(await waitForReadiness(startupDeadline(100), probe, { stopped: () => true })).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("probe contracts", () => {
  it("accepts the engine's root404 while discarding its response body", async () => {
    const cancel = vi.fn(async () => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, body: { cancel } })));
    expect(await probeEngine("http://local", new AbortController().signal)).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([null, [], {}, { viewerPort: null }, { viewerPort: 0 }, { viewerPort: -1 }, { viewerPort: 1.5 }, { viewerPort: 65536 }, { viewerPort: "3113" }, { viewerSkipped: "true" }])("rejects malformed readiness body %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    expect(await probeWorker("http://local", new AbortController().signal)).toBe(false);
  });

  it("publishes a valid discovered viewer port", async () => {
    const found = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ viewerPort: 65535 })));
    expect(await probeWorker("http://local", new AbortController().signal, found)).toBe(true);
    expect(found).toHaveBeenCalledWith(65535);
  });

  it("requires a successful HTTP response even with a ready-shaped body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ viewerSkipped: true }, { status: 503 })));
    expect(await probeWorker("http://local", new AbortController().signal)).toBe(false);
  });
});

describe("worker startup ownership", () => {
  it("does not import a worker after the owned engine has already failed", async () => {
    const options = workerOptions({ stopped: () => true });
    expect(await startWorkerAndWait(options)).toBe(false);
    expect(options.startWorker).not.toHaveBeenCalled();
    expect(options.probe).not.toHaveBeenCalled();
  });

  it("starts exactly one CLI-owned worker", async () => {
    const options = workerOptions();
    expect(await startWorkerAndWait(options)).toBe(true);
    expect(options.startWorker).toHaveBeenCalledOnce();
  });

  it.each(["live pid", "engine-managed"])("waits for %s without importing a duplicate", async (ownership) => {
    fakeTime();
    const options = workerOptions({
      timeoutMs: 10_000,
      hasLiveWorker: () => ownership === "live pid",
      engineStartsWorker: () => ownership === "engine-managed",
      probe: vi.fn(async () => performance.now() >= 8000),
    });
    expect(await advance(startWorkerAndWait(options), 8000)).toBe(true);
    expect(options.startWorker).not.toHaveBeenCalled();
  });

  it("never falls back to a duplicate after an engine-managed worker times out", async () => {
    fakeTime();
    const options = workerOptions({ engineStartsWorker: () => true, probe: vi.fn(async () => false) });
    expect(await advance(startWorkerAndWait(options), 1000)).toBe(false);
    expect(options.startWorker).not.toHaveBeenCalled();
  });

  it("includes async import in the same readiness deadline", async () => {
    fakeTime();
    const options = workerOptions({ startWorker: vi.fn(() => forever<void>()) });
    expect(await advance(startWorkerAndWait(options), 1000)).toBe(false);
    expect(options.probe).not.toHaveBeenCalled();
  });

  it("does not reset the budget after a slow import", async () => {
    fakeTime();
    const options = workerOptions({
      startWorker: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 900))),
      probe: vi.fn(async () => false),
    });
    expect(await advance(startWorkerAndWait(options), 1000)).toBe(false);
    expect(options.probe).toHaveBeenCalledTimes(1);
  });

  it("propagates import failures and removes its deadline timer", async () => {
    fakeTime();
    await expect(startWorkerAndWait(workerOptions({ startWorker: async () => { throw new Error("bad import"); } }))).rejects.toThrow("bad import");
    expect(vi.getTimerCount()).toBe(0);
  });
});

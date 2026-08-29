import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/eval/schemas.js", () => ({ SummaryOutputSchema: {} }));
vi.mock("../src/eval/validator.js", () => ({
  validateOutput: () => ({ valid: true, result: { errors: [] } }),
}));
vi.mock("../src/eval/quality.js", () => ({ scoreSummary: () => 100 }));
vi.mock("../src/functions/audit.js", () => ({
  safeAudit: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  isConsolidationEnabled: () => false,
}));

import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import type {
  CompressedObservation,
  MemoryProvider,
  Session,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    functions,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`unknown fn ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

function makeObs(i: number, sessionId: string): CompressedObservation {
  return {
    id: `obs_${i}`,
    sessionId,
    timestamp: new Date().toISOString(),
    type: "conversation",
    title: `obs ${i}`,
    facts: [`fact ${i}`],
    narrative: `narrative for obs ${i}`,
    concepts: [],
    files: [`src/file_${i}.ts`],
    importance: 5,
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const SUMMARY_XML =
  "<summary><title>orphan</title><narrative>n</narrative>" +
  "<decisions></decisions><files></files><concepts></concepts></summary>";

interface Race {
  summarizing: Promise<unknown>;
  pastRecheck: Promise<void>;
  releaseWrite: () => void;
}

// Parks an in-flight mem::summarize at the point where it has already
// confirmed the session exists but has not yet written the summary row.
// That window is the only interleaving the existence re-check cannot
// close on its own, so every deletion path has to serialize against it.
async function startGatedSummarize(
  sdk: ReturnType<typeof mockSdk>,
  kv: ReturnType<typeof mockKV>,
  sessionId: string,
  startedAt: string,
): Promise<Race> {
  const session: Session = {
    id: sessionId,
    project: "test-project",
    cwd: "/tmp",
    startedAt,
    status: "completed",
    observationCount: 2,
  };
  await kv.set("mem:sessions", sessionId, session);
  for (let i = 0; i < 2; i++) {
    const o = makeObs(i, sessionId);
    await kv.set(`mem:obs:${sessionId}`, o.id, o);
  }

  const providerGate = deferred();
  const provider = {
    name: "test",
    compress: async () => "",
    summarize: async () => {
      await providerGate.promise;
      return SUMMARY_XML;
    },
  } as unknown as MemoryProvider;

  // The handler reads mem:sessions twice: once on entry, once as the
  // existence re-check just before writing.
  const pastRecheck = deferred();
  let sessionReads = 0;
  const rawGet = kv.get;
  kv.get = async <T>(scope: string, key: string): Promise<T | null> => {
    const value = await rawGet<T>(scope, key);
    if (scope === "mem:sessions") {
      sessionReads += 1;
      if (sessionReads === 2) pastRecheck.release();
    }
    return value;
  };

  const writeGate = deferred();
  const rawSet = kv.set;
  kv.set = async <T>(scope: string, key: string, data: T): Promise<T> => {
    if (scope === "mem:summaries") await writeGate.promise;
    return rawSet(scope, key, data);
  };

  registerSummarizeFunction(sdk as never, kv as never, provider);
  const summarizing = sdk.trigger({
    function_id: "mem::summarize",
    payload: { sessionId },
  });
  await tick();
  providerGate.release();

  return {
    summarizing,
    pastRecheck: pastRecheck.promise,
    releaseWrite: writeGate.release,
  };
}

async function expectNoOrphan(
  kv: ReturnType<typeof mockKV>,
  sessionId: string,
): Promise<void> {
  expect(await kv.get("mem:sessions", sessionId)).toBeNull();
  expect(await kv.get("mem:summaries", sessionId)).toBeNull();
  expect(await kv.list(`mem:summary-chunks:${sessionId}`)).toEqual([]);
}

describe("whole-session deletion racing an in-flight mem::summarize", () => {
  it("mem::forget leaves no summary behind when it lands inside the write window", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const sessionId = "sess_forget";
    const race = await startGatedSummarize(
      sdk,
      kv,
      sessionId,
      new Date().toISOString(),
    );

    registerRememberFunction(sdk as never, kv as never);
    await race.pastRecheck;
    const forgetting = sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId },
    });
    for (let i = 0; i < 10; i++) await tick();

    race.releaseWrite();
    await Promise.all([race.summarizing, forgetting]);

    await expectNoOrphan(kv, sessionId);
  });

  it("stale-session eviction leaves no summary behind when it lands inside the write window", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const sessionId = "sess_evict";
    const staleStart = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const race = await startGatedSummarize(sdk, kv, sessionId, staleStart);

    sdk.registerFunction("event::session::stopped", async () => ({
      success: true,
    }));
    registerEvictFunction(sdk as never, kv as never);
    await race.pastRecheck;
    const evicting = sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    });
    for (let i = 0; i < 10; i++) await tick();

    race.releaseWrite();
    await Promise.all([race.summarizing, evicting]);

    await expectNoOrphan(kv, sessionId);
  });

  it("replace-strategy import leaves no summary behind when it lands inside the write window", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const sessionId = "sess_import";
    const race = await startGatedSummarize(
      sdk,
      kv,
      sessionId,
      new Date().toISOString(),
    );

    registerExportImportFunction(sdk as never, kv as never);
    await race.pastRecheck;
    const importing = sdk.trigger({
      function_id: "mem::import",
      payload: {
        strategy: "replace",
        exportData: {
          version: "0.9.29",
          sessions: [],
          observations: {},
          memories: [],
          summaries: [],
        },
      },
    });
    for (let i = 0; i < 10; i++) await tick();

    race.releaseWrite();
    await Promise.all([race.summarizing, importing]);

    await expectNoOrphan(kv, sessionId);
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/schema.js", () => ({
  KV: {
    sessions: "sessions",
    summaries: "summaries",
    observations: (sessionId: string) => `obs:${sessionId}`,
    audit: "audit",
  },
}));

vi.mock("../src/eval/schemas.js", () => ({
  SummaryOutputSchema: {},
}));

vi.mock("../src/eval/validator.js", () => ({
  validateOutput: () => ({ valid: true, result: { errors: [] } }),
}));

vi.mock("../src/eval/quality.js", () => ({
  scoreSummary: () => 100,
}));

vi.mock("../src/functions/audit.js", () => ({
  safeAudit: vi.fn(),
}));

import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { NoopProvider } from "../src/providers/noop.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import { FallbackChainProvider } from "../src/providers/fallback-chain.js";
import type {
  CompressedObservation,
  Session,
  MemoryProvider,
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
    trigger: async () => ({}),
  };
}

function mockMetricsStore() {
  return { record: vi.fn(async () => {}) };
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

function makeRealProvider(response: string): MemoryProvider {
  return {
    name: "test",
    compress: async () => "",
    summarize: async () => response,
  };
}

const SUMMARY_XML = `<summary>
<title>Real summary</title>
<narrative>narrative</narrative>
<decisions><decision>decision A</decision></decisions>
<files><file>src/a.ts</file></files>
<concepts><concept>concept-a</concept></concepts>
</summary>`;

async function setupHandler(opts: {
  sessionId: string;
  obsCount: number;
  provider: MemoryProvider;
}) {
  const sdk = mockSdk();
  const kv = mockKV();
  const metricsStore = mockMetricsStore();
  const session: Session = {
    id: opts.sessionId,
    project: "test-project",
    cwd: "/tmp",
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: opts.obsCount,
  };
  await kv.set("sessions", opts.sessionId, session);
  for (let i = 0; i < opts.obsCount; i++) {
    const o = makeObs(i, opts.sessionId);
    await kv.set(`obs:${opts.sessionId}`, o.id, o);
  }
  registerSummarizeFunction(
    sdk as any,
    kv as any,
    opts.provider,
    metricsStore as any,
  );
  const handler = sdk.functions.get("mem::summarize")!;
  return { handler, kv, metricsStore };
}

describe("zero-LLM mode: summarize skip must not record metrics (#996)", () => {
  it("skips with no_provider when the noop provider is wrapped in ResilientProvider", async () => {
    const { handler, metricsStore } = await setupHandler({
      sessionId: "ses_noop",
      obsCount: 3,
      provider: new ResilientProvider(new NoopProvider()),
    });

    const result: any = await handler({ sessionId: "ses_noop" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("no_provider");
    expect(metricsStore.record).not.toHaveBeenCalled();
  });

  it("skips when the noop provider sits behind resilient(fallback(...)) and every chain member is noop", async () => {
    const { handler, metricsStore } = await setupHandler({
      sessionId: "ses_chain",
      obsCount: 3,
      provider: new ResilientProvider(
        new FallbackChainProvider([new NoopProvider()]),
      ),
    });

    const result: any = await handler({ sessionId: "ses_chain" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("no_provider");
    expect(metricsStore.record).not.toHaveBeenCalled();
  });

  it("does not skip a real provider behind ResilientProvider", async () => {
    const { handler, metricsStore } = await setupHandler({
      sessionId: "ses_real",
      obsCount: 3,
      provider: new ResilientProvider(makeRealProvider(SUMMARY_XML)),
    });

    const result: any = await handler({ sessionId: "ses_real" });

    expect(result.success).toBe(true);
    expect(metricsStore.record).toHaveBeenCalledWith(
      "mem::summarize",
      expect.any(Number),
      true,
      expect.any(Number),
    );
  });

  it("does not skip a fallback chain that contains a real provider", async () => {
    const { handler, metricsStore } = await setupHandler({
      sessionId: "ses_mixed",
      obsCount: 3,
      provider: new ResilientProvider(
        new FallbackChainProvider([
          makeRealProvider(SUMMARY_XML),
          new NoopProvider(),
        ]),
      ),
    });

    const result: any = await handler({ sessionId: "ses_mixed" });

    expect(result.success).toBe(true);
    expect(metricsStore.record).toHaveBeenCalledWith(
      "mem::summarize",
      expect.any(Number),
      true,
      expect.any(Number),
    );
  });
});

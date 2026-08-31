import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", () => ({
  getAgentId: vi.fn(() => undefined),
  isConsolidationEnabled: vi.fn(() => true),
  isGraphExtractionEnabled: vi.fn(() => false),
  getConsolidationCooldownMs: vi.fn(() => 300000),
}));

vi.mock("../src/functions/slots.js", () => ({
  isReflectEnabled: vi.fn(() => false),
}));

import { registerEventTriggers } from "../src/triggers/events.js";
import {
  isConsolidationEnabled,
  isGraphExtractionEnabled,
  getConsolidationCooldownMs,
} from "../src/config.js";
import { isReflectEnabled } from "../src/functions/slots.js";
import { logger } from "../src/logger.js";

// event::session::stopped is the single source of truth for consolidation.
// It fans out mem::summarize (awaited) plus fire-and-forget void triggers for
// slot-reflect / consolidate-pipeline / auto-crystallize, each gated by config.
// The client session-end hook no longer POSTs crystals/auto or
// consolidate-pipeline, so these no longer double-fire for Claude Code.

function mockKV() {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async (_scope: string, _key: string, data: unknown) => data),
    delete: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    list: vi.fn(async () => []),
  };
}

type StoppedHandler = (data: {
  sessionId: string;
  skipConsolidation?: boolean;
}) => Promise<unknown>;

// Builds a spy-backed sdk. `trigger` resolves for mem::summarize with a fake
// summary; void triggers resolve unless `rejectFor` matches the function_id,
// in which case they reject (to exercise fireVoid's .catch()).
function mockSdk(opts?: { rejectFor?: string }) {
  const handlers = new Map<string, StoppedHandler>();
  const trigger = vi.fn(
    async (input: { function_id: string; payload?: unknown; action?: unknown }) => {
      if (opts?.rejectFor && input.function_id === opts.rejectFor) {
        throw new Error(`boom: ${input.function_id}`);
      }
      if (input.function_id === "mem::summarize") {
        return { summary: "session summary", sessionId: "ses_1" };
      }
      return { ok: true };
    },
  );
  return {
    sdk: {
      registerFunction: (id: string, handler: StoppedHandler) => handlers.set(id, handler),
      registerTrigger: () => {},
      trigger,
    },
    handlers,
    trigger,
  };
}

function functionIds(trigger: ReturnType<typeof vi.fn>): string[] {
  return trigger.mock.calls.map((c) => (c[0] as { function_id: string }).function_id);
}

describe("event::session::stopped consolidation fan-out", () => {
  beforeEach(() => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(false);
    vi.mocked(isReflectEnabled).mockReturnValue(false);
    vi.mocked(logger.warn).mockClear();
  });

  it("fires consolidate-pipeline and auto-crystallize when consolidation enabled", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, mockKV() as never);

    const stopped = handlers.get("event::session::stopped")!;
    await stopped({ sessionId: "ses_1" });

    const ids = functionIds(trigger);
    expect(ids).toContain("mem::summarize");
    expect(ids).toContain("mem::consolidate-pipeline");
    expect(ids).toContain("mem::auto-crystallize");

    const consolidateCall = trigger.mock.calls.find(
      (c) => (c[0] as { function_id: string }).function_id === "mem::consolidate-pipeline",
    );
    expect((consolidateCall![0] as { payload: unknown }).payload).toEqual({
      tier: "all",
      force: true,
    });
    const crystallizeCall = trigger.mock.calls.find(
      (c) => (c[0] as { function_id: string }).function_id === "mem::auto-crystallize",
    );
    expect((crystallizeCall![0] as { payload: unknown }).payload).toEqual({
      olderThanDays: 0,
    });
  });

  it("skips consolidate-pipeline and auto-crystallize when consolidation disabled but still summarizes", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(false);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, mockKV() as never);

    const stopped = handlers.get("event::session::stopped")!;
    await stopped({ sessionId: "ses_1" });

    const ids = functionIds(trigger);
    expect(ids).toContain("mem::summarize");
    expect(ids).not.toContain("mem::consolidate-pipeline");
    expect(ids).not.toContain("mem::auto-crystallize");
  });

  it("suppresses the consolidation fan-out when skipConsolidation is set (eviction recovery path)", async () => {
    // Regression: mem::evict calls event::session::stopped once per recovered
    // stale session, then runs ONE final consolidation pass. Without the
    // skipConsolidation guard, N recovered sessions would launch N concurrent
    // forced full-corpus consolidations + N crystallizations.
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, mockKV() as never);

    const stopped = handlers.get("event::session::stopped")!;
    await stopped({ sessionId: "ses_1", skipConsolidation: true });

    const ids = functionIds(trigger);
    // Per-session work still happens...
    expect(ids).toContain("mem::summarize");
    // ...but the corpus-wide fan-out is deferred to evict's single pass.
    expect(ids).not.toContain("mem::consolidate-pipeline");
    expect(ids).not.toContain("mem::auto-crystallize");
  });

  it("still fans out when skipConsolidation is explicitly false (normal stop)", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, mockKV() as never);

    await handlers.get("event::session::stopped")!({
      sessionId: "ses_1",
      skipConsolidation: false,
    });

    const ids = functionIds(trigger);
    expect(ids).toContain("mem::consolidate-pipeline");
    expect(ids).toContain("mem::auto-crystallize");
  });

  it("respects the cooldown across repeated stops but this suite's non-persistent KV fires each single call", async () => {
    // Sanity: with the default cooldown and a fresh (marker-less) KV, a single
    // stop still consolidates. The real debounce is exercised below with a
    // persistent KV.
    vi.mocked(getConsolidationCooldownMs).mockReturnValue(300000);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, mockKV() as never);
    await handlers.get("event::session::stopped")!({ sessionId: "ses_1" });
    expect(functionIds(trigger)).toContain("mem::consolidate-pipeline");
  });

  it("respects isReflectEnabled gating for slot-reflect", async () => {
    vi.mocked(isReflectEnabled).mockReturnValue(false);
    const off = mockSdk();
    registerEventTriggers(off.sdk as never, mockKV() as never);
    await off.handlers.get("event::session::stopped")!({ sessionId: "ses_1" });
    expect(functionIds(off.trigger)).not.toContain("mem::slot-reflect");

    vi.mocked(isReflectEnabled).mockReturnValue(true);
    const on = mockSdk();
    registerEventTriggers(on.sdk as never, mockKV() as never);
    await on.handlers.get("event::session::stopped")!({ sessionId: "ses_1" });
    expect(functionIds(on.trigger)).toContain("mem::slot-reflect");
  });

  it("does not throw and still returns the summary when consolidate-pipeline trigger rejects", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    const { sdk, handlers } = mockSdk({ rejectFor: "mem::consolidate-pipeline" });
    registerEventTriggers(sdk as never, mockKV() as never);

    const stopped = handlers.get("event::session::stopped")!;
    const summary = await stopped({ sessionId: "ses_1" });

    expect(summary).toEqual({ summary: "session summary", sessionId: "ses_1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith(
      "mem::consolidate-pipeline trigger failed",
      expect.objectContaining({ sessionId: "ses_1" }),
    );
  });
});

// The client session-end hook is bundled into a standalone binary that reads
// stdin and POSTs to REST, so it is exercised at the source level: after the
// double-fire fix it must no longer POST the two direct consolidation
// endpoints, leaving event::session::stopped as the only consolidation path.
describe("session-end hook no longer double-fires consolidation", () => {
  const src = readFileSync("src/hooks/session-end.ts", "utf-8");

  it("does not POST /agentmemory/crystals/auto", () => {
    expect(src).not.toContain("/agentmemory/crystals/auto");
  });

  it("does not POST /agentmemory/consolidate-pipeline", () => {
    expect(src).not.toContain("/agentmemory/consolidate-pipeline");
  });

  it("no longer references the CONSOLIDATION_ENABLED gate", () => {
    expect(src).not.toContain("CONSOLIDATION_ENABLED");
  });

  it("still POSTs /agentmemory/session/end (the single source of truth path)", () => {
    expect(src).toContain("/agentmemory/session/end");
  });

  it("keeps the claude-bridge/sync block", () => {
    expect(src).toContain("/agentmemory/claude-bridge/sync");
  });

  it("keeps the null-guard and main().catch() patterns", () => {
    expect(src).toContain('if (!data || typeof data !== "object") return;');
    expect(src).toContain("main().catch(() => process.exit(0));");
  });
});

// A KV that actually persists writes, so the debounce marker survives between
// simulated per-turn stops.
function persistentKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async (scope: string, key: string) => store.get(scope)?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, data: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    }),
    delete: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    list: vi.fn(async () => []),
  };
}

// Regression: the Stop hook posts /session/end on every agent turn, which fires
// event::session::stopped. consolidate-pipeline + auto-crystallize are full
// corpus LLM work with no internal "nothing changed" guard, so firing them per
// turn is a cost/latency storm for connected agents (Claude/Codex/Copilot/
// Hermes). The debounce bounds corpus consolidation to once per cooldown.
describe("session-stop consolidation debounce", () => {
  beforeEach(() => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(false);
    vi.mocked(isReflectEnabled).mockReturnValue(false);
    vi.mocked(getConsolidationCooldownMs).mockReturnValue(300000);
  });

  it("consolidates at most once across many per-turn stops within the cooldown", async () => {
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, persistentKV() as never);
    const stopped = handlers.get("event::session::stopped")!;

    // 5 per-turn Stop hooks in quick succession (all within the cooldown).
    for (let i = 0; i < 5; i++) await stopped({ sessionId: "ses_1" });

    const count = (id: string) =>
      trigger.mock.calls.filter(
        (c) => (c[0] as { function_id: string }).function_id === id,
      ).length;

    // Corpus consolidation runs ONCE, not five times.
    expect(count("mem::consolidate-pipeline")).toBe(1);
    expect(count("mem::auto-crystallize")).toBe(1);
    // Per-turn summary capture still runs every turn (the cheap path).
    expect(count("mem::summarize")).toBe(5);
  });

  it("consolidates once when stops arrive concurrently (serialized cooldown check)", async () => {
    // Regression: without serialization, two stops racing through the marker
    // read-check-write both observe the stale marker and both fire.
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, persistentKV() as never);
    const stopped = handlers.get("event::session::stopped")!;

    await Promise.all([
      stopped({ sessionId: "ses_1" }),
      stopped({ sessionId: "ses_2" }),
      stopped({ sessionId: "ses_3" }),
    ]);

    const consolidateCount = trigger.mock.calls.filter(
      (c) => (c[0] as { function_id: string }).function_id === "mem::consolidate-pipeline",
    ).length;
    expect(consolidateCount).toBe(1);
  });

  it("consolidates on every stop when the cooldown is disabled (0)", async () => {
    vi.mocked(getConsolidationCooldownMs).mockReturnValue(0);
    const { sdk, handlers, trigger } = mockSdk();
    registerEventTriggers(sdk as never, persistentKV() as never);
    const stopped = handlers.get("event::session::stopped")!;

    await stopped({ sessionId: "ses_1" });
    await stopped({ sessionId: "ses_1" });

    const consolidateCount = trigger.mock.calls.filter(
      (c) => (c[0] as { function_id: string }).function_id === "mem::consolidate-pipeline",
    ).length;
    expect(consolidateCount).toBe(2);
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/config.js", () => ({
  getAgentId: vi.fn(() => undefined),
  isConsolidationEnabled: vi.fn(() => false),
  isGraphExtractionEnabled: vi.fn(() => false),
  getConsolidationCooldownMs: vi.fn(() => 300000),
}));
vi.mock("../src/functions/slots.js", () => ({
  isReflectEnabled: vi.fn(() => false),
}));

import { registerEventTriggers } from "../src/triggers/events.js";

type Handler = (data: unknown) => Promise<unknown>;
type Update = { type: string; path: string; value: unknown };

function harness() {
  const handlers = new Map<string, Handler>();
  const update = vi.fn(async () => {});
  const kv = {
    get: vi.fn(async () => null),
    set: vi.fn(async (_s: string, _k: string, data: unknown) => data),
    delete: vi.fn(async () => {}),
    update,
    list: vi.fn(async () => []),
  };
  const sdk = {
    registerFunction: (id: string, handler: Handler) => {
      handlers.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: vi.fn(async () => ({ success: true })),
  };
  registerEventTriggers(sdk as never, kv as never);
  return { handlers, update };
}

function updatesFrom(update: ReturnType<typeof vi.fn>): Update[] {
  return update.mock.calls[0]![2] as Update[];
}

describe("event::session::ended", () => {
  it("uses a caller-supplied endedAt", async () => {
    // mem::session-sweep passes the session's last activity so an idle session
    // is not recorded as having run until the moment the sweep noticed it.
    const { handlers, update } = harness();
    const lastActivity = "2026-08-20T09:15:00.000Z";

    await handlers.get("event::session::ended")!({
      sessionId: "ses_x",
      endedAt: lastActivity,
    });

    const updates = updatesFrom(update);
    expect(updates).toContainEqual({
      type: "set",
      path: "endedAt",
      value: lastActivity,
    });
    expect(updates).toContainEqual({
      type: "set",
      path: "status",
      value: "completed",
    });
  });

  it.each([
    ["garbage", "not-a-date"],
    ["empty", ""],
    ["a number", 1756600000000],
    ["null", null],
    ["an object", { when: "yesterday" }],
  ])("ignores an unusable endedAt (%s)", async (_label, bad) => {
    // This handler is also a durable subscriber, so the payload is untrusted.
    // The viewer derives duration from endedAt; a bogus value renders as a
    // bogus duration.
    const { handlers, update } = harness();
    const before = Date.now();

    await handlers.get("event::session::ended")!({
      sessionId: "ses_bad",
      endedAt: bad,
    });

    const stamp = updatesFrom(update).find((u) => u.path === "endedAt")!
      .value as string;
    const parsed = new Date(stamp).getTime();
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThanOrEqual(before);
  });

  it("falls back to now when no endedAt is supplied", async () => {
    const { handlers, update } = harness();
    const before = Date.now();

    await handlers.get("event::session::ended")!({ sessionId: "ses_y" });

    const stamp = updatesFrom(update).find((u) => u.path === "endedAt")!
      .value as string;
    const parsed = new Date(stamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });
});

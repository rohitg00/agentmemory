import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import type { Session } from "../src/types.js";

// #745: Claude Code fires Stop at the end of EVERY assistant turn, not only
// at genuine session end, and the Stop hook posts to the same
// /agentmemory/session/end endpoint as the real SessionEnd hook, with the
// same payload shape. Writing endedAt + status:"completed" unconditionally
// there marked every live session terminated on every turn, producing
// phantom "abandoned session" diagnostics. The terminal write is now gated
// on an explicit `final: true` flag that only the genuine SessionEnd hook
// sends; the per-turn Stop hook does not, and event::session::stopped keeps
// firing unconditionally on both so summarize/graph/consolidation still run
// every turn.
describe("api::session::end final flag (#745)", () => {
  function seedSession(kv: ReturnType<typeof mockKV>, id = "s1") {
    return kv.set(KV.sessions, id, {
      id,
      project: "p",
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 3,
    } satisfies Session);
  }

  it("a post without `final` does not write endedAt/status but still fans out event::session::stopped", async () => {
    const kv = mockKV();
    await seedSession(kv);
    const sdk = mockSdk();
    const stopped = vi.fn(async () => ({ success: true }));
    sdk.registerFunction("event::session::stopped", stopped);
    registerApiTriggers(sdk as never, kv as never);

    const handler = sdk.fns.get("api::session::end")!;
    const res = (await handler({ body: { sessionId: "s1" } } as never)) as {
      status_code: number;
    };
    expect(res.status_code).toBe(200);

    const session = await kv.get<Session>(KV.sessions, "s1");
    expect(session?.status).toBe("active");
    expect(session?.endedAt).toBeUndefined();

    // Fan-out is fire-and-forget (not awaited by the handler); flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect(stopped).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("a post with final: true writes endedAt/status and still fans out event::session::stopped", async () => {
    const kv = mockKV();
    await seedSession(kv);
    const sdk = mockSdk();
    const stopped = vi.fn(async () => ({ success: true }));
    sdk.registerFunction("event::session::stopped", stopped);
    registerApiTriggers(sdk as never, kv as never);

    const handler = sdk.fns.get("api::session::end")!;
    const res = (await handler({
      body: { sessionId: "s1", final: true },
    } as never)) as { status_code: number };
    expect(res.status_code).toBe(200);

    const session = await kv.get<Session>(KV.sessions, "s1");
    expect(session?.status).toBe("completed");
    expect(session?.endedAt).toBeDefined();

    await new Promise((r) => setTimeout(r, 0));
    expect(stopped).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it.each([["true" /* string */], [1], [{}], [[]], [null]])(
    "a non-boolean final (%j) does not trigger the terminal write",
    async (finalValue) => {
      const kv = mockKV();
      await seedSession(kv);
      const sdk = mockSdk();
      sdk.registerFunction("event::session::stopped", async () => ({ success: true }));
      registerApiTriggers(sdk as never, kv as never);

      const handler = sdk.fns.get("api::session::end")!;
      const res = (await handler({
        body: { sessionId: "s1", final: finalValue },
      } as never)) as { status_code: number };
      expect(res.status_code).toBe(200);

      const session = await kv.get<Session>(KV.sessions, "s1");
      expect(session?.status).toBe("active");
      expect(session?.endedAt).toBeUndefined();
    },
  );
});

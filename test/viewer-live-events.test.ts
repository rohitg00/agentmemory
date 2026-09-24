import { describe, it, expect, vi } from "vitest";
import { registerEventTriggers } from "../src/triggers/events.js";
import type { StateKV } from "../src/state/kv.js";

type Handler = (payload: unknown) => Promise<unknown>;

function setup() {
  const handlers = new Map<string, Handler>();
  const triggers: Array<{ type: string; function_id: string; config: Record<string, unknown> }> = [];
  const sent: Array<{ type: string; group_id: string; data: Record<string, unknown> }> = [];
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: (t: { type: string; function_id: string; config: Record<string, unknown> }) => triggers.push(t),
    trigger: vi.fn(async (req: { function_id: string; payload: Record<string, unknown> }) => {
      if (req.function_id === "stream::send") {
        sent.push(req.payload as (typeof sent)[number]);
      }
      return {};
    }),
  };
  registerEventTriggers(sdk as never, {} as StateKV);
  return { handlers, triggers, sent };
}

describe("viewer live events", () => {
  it("pushes session.updated for every session write and keeps session.activity for count growth", async () => {
    const { handlers, sent } = setup();
    const handler = handlers.get("event::session::observation-count-changed")!;
    await handler({
      key: "s1",
      event_type: "update",
      old_value: { id: "s1", status: "active", observationCount: 2 },
      new_value: { id: "s1", status: "active", observationCount: 3 },
    });
    expect(sent.map((e) => e.type)).toEqual(["session.updated", "session.activity"]);
    expect(sent[0].group_id).toBe("viewer");
    expect(sent[0].data.session).toMatchObject({ id: "s1", observationCount: 3 });
    expect(sent[1].data).toMatchObject({ sessionId: "s1", observationCount: 3, delta: 1 });
  });

  it("pushes session.updated without session.activity when only the status changes", async () => {
    const { handlers, sent } = setup();
    await handlers.get("event::session::observation-count-changed")!({
      key: "s1",
      event_type: "update",
      old_value: { id: "s1", status: "active", observationCount: 3 },
      new_value: { id: "s1", status: "completed", observationCount: 3 },
    });
    expect(sent.map((e) => e.type)).toEqual(["session.updated"]);
    expect(sent[0].data.session).toMatchObject({ status: "completed" });
  });

  it("pushes session.deleted when a session is removed", async () => {
    const { handlers, sent } = setup();
    await handlers.get("event::session::observation-count-changed")!({ key: "s9", event_type: "delete" });
    expect(sent).toEqual([expect.objectContaining({ type: "session.deleted", data: { sessionId: "s9" } })]);
  });

  it("pushes a slim memory.updated or memory.deleted on memory writes", async () => {
    const { handlers, triggers, sent } = setup();
    expect(triggers).toContainEqual(
      expect.objectContaining({ type: "state", function_id: "event::memory::changed", config: { scope: "mem:memories" } }),
    );
    const handler = handlers.get("event::memory::changed")!;
    await handler({
      key: "m1",
      event_type: "create",
      new_value: { id: "m1", type: "fact", title: "t", content: "long body", isLatest: true, updatedAt: "2026-09-24T00:00:00Z" },
    });
    await handler({ key: "m1", event_type: "delete" });
    expect(sent.map((e) => e.type)).toEqual(["memory.updated", "memory.deleted"]);
    expect(sent[0].data).toEqual({
      memoryId: "m1",
      type: "fact",
      title: "t",
      isLatest: true,
      updatedAt: "2026-09-24T00:00:00Z",
    });
    expect(sent[1].data).toEqual({ memoryId: "m1" });
  });
});

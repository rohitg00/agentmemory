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
      event_type: "state:updated",
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
      event_type: "state:updated",
      old_value: { id: "s1", status: "active", observationCount: 3 },
      new_value: { id: "s1", status: "completed", observationCount: 3 },
    });
    expect(sent.map((e) => e.type)).toEqual(["session.updated"]);
    expect(sent[0].data.session).toMatchObject({ status: "completed" });
  });

  it("pushes session.deleted when a session is removed", async () => {
    const { handlers, sent } = setup();
    await handlers.get("event::session::observation-count-changed")!({
      key: "s9",
      event_type: "state:deleted",
      old_value: { id: "s9", status: "completed", observationCount: 4 },
      new_value: null,
    });
    expect(sent).toEqual([expect.objectContaining({ type: "session.deleted", data: { sessionId: "s9" } })]);
  });

  it("drops session and memory events from other agents when agent scope is isolated", async () => {
    vi.stubEnv("AGENT_ID", "agent-a");
    vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "isolated");
    try {
      const { handlers, sent } = setup();
      const sessions = handlers.get("event::session::observation-count-changed")!;
      const memories = handlers.get("event::memory::changed")!;
      await sessions({ key: "s1", event_type: "state:created", new_value: { id: "s1", agentId: "agent-b", observationCount: 1 } });
      await sessions({ key: "s2", event_type: "state:deleted", old_value: { id: "s2", agentId: "agent-b" }, new_value: null });
      await memories({ key: "m1", event_type: "state:created", new_value: { id: "m1", agentId: "agent-b" } });
      expect(sent).toEqual([]);
      await sessions({ key: "s3", event_type: "state:created", new_value: { id: "s3", agentId: "agent-a", observationCount: 0 } });
      await memories({ key: "m2", event_type: "state:deleted", old_value: { id: "m2", agentId: "agent-a" }, new_value: null });
      expect(sent.map((e) => e.type)).toEqual(["session.updated", "memory.deleted"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("pushes a slim memory.updated or memory.deleted on memory writes", async () => {
    const { handlers, triggers, sent } = setup();
    expect(triggers).toContainEqual(
      expect.objectContaining({ type: "state", function_id: "event::memory::changed", config: { scope: "mem:memories" } }),
    );
    const handler = handlers.get("event::memory::changed")!;
    await handler({
      key: "m1",
      event_type: "state:created",
      new_value: { id: "m1", type: "fact", title: "t", content: "long body", isLatest: true, updatedAt: "2026-09-24T00:00:00Z" },
    });
    await handler({ key: "m1", event_type: "state:deleted", new_value: null });
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

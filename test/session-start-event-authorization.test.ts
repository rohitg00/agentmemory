import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerContextFunction } from "../src/functions/context.js";
import {
  systemLessonAccessContext,
} from "../src/functions/lesson-access.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import type { Lesson } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

const PRIVATE_LESSON_CONTENT = "Restricted session-start event lesson";

describe("session-start event lesson authorization", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "enforce";
    sdk = mockSdk();
    kv = mockKV();
    registerLessonsFunctions(sdk as never, kv as never);
    registerContextFunction(sdk as never, kv as never, 2_000);
    registerEventTriggers(sdk as never, kv as never);

    const saved = (await sdk.trigger("mem::lesson-save", {
      content: PRIVATE_LESSON_CONTENT,
      project: "private-project",
      mechanismId: "authorization/session-start-event",
      claim: "Session-start events must preserve caller lesson authority.",
      scope: {
        ring: "repo",
        scopeId: "repo:https://github.com/wrightpt/private-project",
      },
      sensitivity: "restricted",
      accessContext: systemLessonAccessContext(),
    })) as { lesson: Lesson };
    expect(saved.lesson.content).toBe(PRIVATE_LESSON_CONTENT);
  });

  afterEach(() => {
    delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
  });

  it("does not retrieve restricted lessons from absent or forged caller authority", async () => {
    const forgedSystemContext = {
      ...systemLessonAccessContext(),
      authorizationProof: "00".repeat(32),
    };

    for (const [sessionId, accessContext] of [
      ["caller-controlled-absent", undefined],
      ["caller-controlled-forged", forgedSystemContext],
    ] as const) {
      const result = (await sdk.trigger("event::session::started", {
        sessionId,
        project: "private-project",
        cwd: "/tmp/private-project",
        ...(accessContext ? { accessContext } : {}),
      })) as { context: string };

      expect(result.context).not.toContain(PRIVATE_LESSON_CONTENT);
    }
  });

  it("propagates an explicitly sealed internal service context", async () => {
    const result = (await sdk.trigger("event::session::started", {
      sessionId: "sealed-service",
      project: "private-project",
      cwd: "/tmp/private-project",
      accessContext: systemLessonAccessContext(),
    })) as { context: string };

    expect(result.context).toContain(PRIVATE_LESSON_CONTENT);
  });

  it("preserves classification-mode compatibility without a context payload", async () => {
    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "classify";

    const result = (await sdk.trigger("event::session::started", {
      sessionId: "classification-compatible",
      project: "private-project",
      cwd: "/tmp/private-project",
    })) as { context: string };

    expect(result.context).toContain(PRIVATE_LESSON_CONTENT);
  });
});

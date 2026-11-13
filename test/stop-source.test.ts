import { describe, expect, it } from "vitest";
import { expectExit, expectPost, failureCases, runSourceHook } from "./helpers/hook-source.js";

const payload = { session_id: "source-session", cwd: "/fixture/repo", last_assistant_message: "Literal assistant reply." };

describe("stop source entrypoint", () => {
  it("captures the reply before ending the turn", async () => {
    const result = await runSourceHook("stop", payload);
    expectExit(result);
    expect(result.requests).toHaveLength(2);
    expectPost(result.requests[0], "/agentmemory/observe");
    expectPost(result.requests[1], "/agentmemory/session/end");
    expect(result.requests[0].body).toEqual({
      hookType: "stop", sessionId: "source-session", project: "source-hook-project", cwd: "/fixture/repo",
      timestamp: expect.any(String), eventId: expect.stringMatching(/^evc_[0-9a-f]{32}$/),
      data: { last_assistant_message: "Literal assistant reply." },
    });
    expect(result.requests[1].body).toEqual({ sessionId: "source-session", final: false });
    expect(result.spooled).toEqual([]);
  });

  it("ends a turn without capturing a blank reply", async () => {
    const result = await runSourceHook("stop", { ...payload, last_assistant_message: " \n" });
    expectExit(result);
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/session/end");
    expect(result.requests[0].body).toEqual({ sessionId: "source-session", final: false });
  });

  failureCases("stop", payload, { capture: true, requestPaths: ["/agentmemory/observe", "/agentmemory/session/end"] });
});

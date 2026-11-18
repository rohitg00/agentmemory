import { describe, expect, it } from "vitest";
import { expectExit, expectPost, failureCases, runSourceHook } from "./helpers/hook-source.js";

const payload = { session_id: "source-session", cwd: "/fixture/repo", hook_event_name: "SessionStart" };

describe("session-start source entrypoint", () => {
  it("registers the session and prints the host context envelope", async () => {
    const result = await runSourceHook("session-start", payload);
    expectExit(result, JSON.stringify({ hookSpecificOutput: {
      hookEventName: "SessionStart", additionalContext: "source-hook recalled context",
    } }));
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/session/start");
    expect(result.requests[0].body).toEqual({
      sessionId: "source-session", project: "source-hook-project", cwd: "/fixture/repo",
    });
    expect(result.spooled).toEqual([]);
  });

  it("registers without printing context when injection is disabled", async () => {
    const result = await runSourceHook("session-start", payload, { env: { AGENTMEMORY_INJECT_CONTEXT: "false" } });
    expectExit(result);
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/session/start");
  });

  failureCases("session-start", payload, { capture: false, requestPaths: ["/agentmemory/session/start"] });
});

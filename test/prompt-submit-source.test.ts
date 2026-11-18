import { describe, expect, it } from "vitest";
import { expectExit, expectPost, failureCases, runSourceHook } from "./helpers/hook-source.js";

const payload = { session_id: "source-session", cwd: "/fixture/repo", prompt: "Keep this literal user prompt.", prompt_id: "prompt-1" };

describe("prompt-submit source entrypoint", () => {
  it("captures the prompt with session, project and host event identity", async () => {
    const result = await runSourceHook("prompt-submit", payload);
    expectExit(result);
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/observe");
    expect(result.requests[0].body).toEqual({
      hookType: "prompt_submit", sessionId: "source-session", project: "source-hook-project", cwd: "/fixture/repo",
      timestamp: expect.any(String), eventId: expect.stringMatching(/^evh_[0-9a-f]{32}$/),
      data: { prompt: "Keep this literal user prompt." },
    });
    expect(result.spooled).toEqual([]);
  });

  failureCases("prompt-submit", payload, { capture: true, requestPaths: ["/agentmemory/observe"] });
});

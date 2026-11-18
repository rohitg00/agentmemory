import { describe, expect, it } from "vitest";
import { expectExit, expectPost, failureCases, runSourceHook } from "./helpers/hook-source.js";

const payload = {
  session_id: "source-session", cwd: "/fixture/repo", tool_use_id: "tool-1", tool_name: "Read",
  tool_input: { file_path: "/fixture/repo/file.ts" }, tool_response: "Literal tool output.",
};

describe("post-tool-use source entrypoint", () => {
  it("captures the complete tool payload with host event identity", async () => {
    const result = await runSourceHook("post-tool-use", payload);
    expectExit(result);
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/observe");
    expect(result.requests[0].body).toEqual({
      hookType: "post_tool_use", sessionId: "source-session", project: "source-hook-project", cwd: "/fixture/repo",
      timestamp: expect.any(String), eventId: expect.stringMatching(/^evh_[0-9a-f]{32}$/),
      data: { tool_name: "Read", tool_input: { file_path: "/fixture/repo/file.ts" }, tool_output: "Literal tool output." },
    });
    expect(result.spooled).toEqual([]);
  });

  it("keeps memory tool calls out of capture", async () => {
    const result = await runSourceHook("post-tool-use", { ...payload, tool_name: "mcp__agentmemory__memory_save" });
    expectExit(result);
    expect(result.requests).toEqual([]);
  });

  failureCases("post-tool-use", payload, { capture: true, requestPaths: ["/agentmemory/observe"] });
});

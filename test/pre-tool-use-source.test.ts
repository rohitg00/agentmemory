import { describe, expect, it } from "vitest";
import { expectExit, expectPost, failureCases, runSourceHook } from "./helpers/hook-source.js";

const payload = {
  session_id: "source-session", cwd: "/fixture/repo", hook_event_name: "PreToolUse",
  tool_name: "Read", tool_input: { file_path: "/fixture/repo/file.ts" },
};

describe("pre-tool-use source entrypoint", () => {
  it("requests scoped file context and prints the host envelope", async () => {
    const result = await runSourceHook("pre-tool-use", payload);
    expectExit(result, JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PreToolUse", additionalContext: "source-hook recalled context",
    } }));
    expect(result.requests).toHaveLength(1);
    expectPost(result.requests[0], "/agentmemory/enrich");
    expect(result.requests[0].body).toEqual({
      sessionId: "source-session", files: ["/fixture/repo/file.ts"], terms: [], toolName: "Read", project: "source-hook-project",
    });
    expect(result.spooled).toEqual([]);
  });

  it("sends nothing when context injection is disabled", async () => {
    const result = await runSourceHook("pre-tool-use", payload, { env: { AGENTMEMORY_INJECT_CONTEXT: "false" } });
    expectExit(result);
    expect(result.requests).toEqual([]);
  });

  failureCases("pre-tool-use", payload, { capture: false, requestPaths: ["/agentmemory/enrich"] });
});

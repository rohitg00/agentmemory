import { describe, expect, it } from "vitest";
import { pickRawToolOutput } from "../src/hooks/post-tool-use-util.js";

describe("post-tool-use payload compatibility", () => {
  it("prefers Copilot's tool_result.text_result_for_llm", () => {
    const raw = pickRawToolOutput({
      tool_result: { text_result_for_llm: "copilot-result" },
      tool_response: "legacy-response",
      tool_output: "legacy-output",
    });
    expect(raw).toBe("copilot-result");
  });

  it("falls back to legacy tool_response/tool_output", () => {
    expect(
      pickRawToolOutput({
        tool_response: "legacy-response",
        tool_output: "legacy-output",
      }),
    ).toBe("legacy-response");

    expect(
      pickRawToolOutput({
        tool_output: "legacy-output",
      }),
    ).toBe("legacy-output");
  });
});

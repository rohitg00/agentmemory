import { describe, expect, it } from "vitest";

import { buildAgentOptions, getInitialAgentValues } from "../src/cli/onboarding.js";

describe("first-run onboarding", () => {
  it("offers GitHub Copilot CLI as a native setup target", () => {
    const options = buildAgentOptions();
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "copilot-cli",
          label: expect.stringContaining("GitHub Copilot CLI"),
          hint: "native plugin",
        }),
      ]),
    );
  });

  it("selects GitHub Copilot CLI by default when running inside Copilot CLI", () => {
    expect(getInitialAgentValues({ COPILOT_CLI: "1" })).toEqual(["copilot-cli"]);
    expect(getInitialAgentValues({ COPILOT_AGENT_SESSION_ID: "session" })).toEqual(["copilot-cli"]);
  });

  it("keeps Claude Code as the default outside known agent environments", () => {
    expect(getInitialAgentValues({})).toEqual(["claude-code"]);
  });
});

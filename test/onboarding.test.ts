import { describe, expect, it } from "vitest";

import { buildAgentOptions } from "../src/cli/onboarding.js";

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
});

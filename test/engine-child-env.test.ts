import { describe, expect, it } from "vitest";
import { engineChildEnv } from "../src/cli/engine-launch.js";

describe("engineChildEnv", () => {
  it("turns the engine's anonymous usage telemetry off when the user has not chosen", () => {
    const env = engineChildEnv({ PATH: "/usr/bin" });

    expect(env["III_TELEMETRY_ENABLED"]).toBe("false");
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("keeps an explicit opt-in or opt-out", () => {
    expect(engineChildEnv({ III_TELEMETRY_ENABLED: "true" })["III_TELEMETRY_ENABLED"]).toBe("true");
    expect(engineChildEnv({ III_TELEMETRY_ENABLED: "false" })["III_TELEMETRY_ENABLED"]).toBe("false");
  });
});

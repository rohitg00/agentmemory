import { describe, it, expect } from "vitest";
import { redactCredentialUrls, runtimeConfigPath } from "../src/cli/engine-launch.js";

describe("engine runtime metadata paths", () => {
  it("scopes the legacy runtime config path to its resolved data directory", () => {
    expect(runtimeConfigPath("/var/lib/agentmemory/instance-1")).toBe("/var/lib/agentmemory/instance-1/iii-config.runtime.yaml");
  });
});

describe("credential URL redaction", () => {
  it("masks credentials without touching the rest of the message", () => {
    expect(redactCredentialUrls("Failed redis://user:s3cr3t@localhost:6379"))
      .toBe("Failed redis://***@localhost:6379");
  });
  it("leaves text with no credentials untouched", () => {
    expect(redactCredentialUrls("engine exited with code 1")).toBe("engine exited with code 1");
  });
});

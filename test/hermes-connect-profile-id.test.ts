import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  defaultHermesHome,
  profileAgentIdFromHermesHome,
  renderHermesMcpConfig,
} from "../src/cli/connect/hermes.js";

describe("Hermes MCP profile binding", () => {
  it("renders the named Hermes profile as the fixed MCP agent identity", () => {
    const profileHome = join("root", "profiles", "alpha");

    expect(profileAgentIdFromHermesHome(profileHome)).toBe("alpha");
    expect(renderHermesMcpConfig(profileHome)).toContain('AGENT_ID: "alpha"');
    const config = renderHermesMcpConfig(profileHome);
    expect(config).toContain('AGENTMEMORY_AGENT_SCOPE: "isolated"');
    const expectedTools = [
      "memory_save",
      "memory_recall",
      "memory_smart_search",
      "memory_sessions",
    ];
    const includedTools = config
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- memory_"))
      .map((line) => line.slice(2));
    expect(includedTools).toEqual(expectedTools);
  });

  it("uses default for a root Hermes home", () => {
    expect(profileAgentIdFromHermesHome(join("root", "hermes"))).toBe("default");
  });

  it("uses Hermes' native Windows home instead of ~/.hermes", () => {
    const localAppData = String.raw`C:\Users\Example\AppData\Local`;
    const userHome = String.raw`C:\Users\Example`;
    expect(
      defaultHermesHome(
        "win32",
        { LOCALAPPDATA: localAppData },
        userHome,
      ),
    ).toBe(join(localAppData, "hermes"));
  });
});

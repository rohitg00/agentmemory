import { describe, expect, it } from "vitest";
import {
  consoleArgs,
  defaultConsolePort,
  parseConsoleArgs,
} from "../src/cli/console.js";

describe("agentmemory console", () => {
  it("serves one port above the viewer so the two never collide", () => {
    expect(defaultConsolePort(3113)).toBe(3114);
    expect(defaultConsolePort(3213)).toBe(3214);
  });

  it("builds the pinned engine's console invocation against the resolved port quartet", () => {
    expect(
      consoleArgs({
        iiiBin: "/home/u/.agentmemory/bin/iii",
        consolePort: 3114,
        restPort: 3111,
        streamPort: 3112,
        enginePort: 49134,
        extraArgs: ["--enable-flow"],
      }),
    ).toEqual([
      "console",
      "--port",
      "3114",
      "--engine-port",
      "3111",
      "--ws-port",
      "3112",
      "--bridge-port",
      "49134",
      "--enable-flow",
    ]);
  });

  it("takes --console-port in both spellings and falls back to the default", () => {
    expect(parseConsoleArgs([], 3114)).toEqual({ consolePort: 3114, extraArgs: [] });
    expect(parseConsoleArgs(["--console-port", "4000"], 3114).consolePort).toBe(4000);
    expect(parseConsoleArgs(["--console-port=4001"], 3114).consolePort).toBe(4001);
  });

  it("drops the CLI's own global flags and forwards everything else to iii console", () => {
    const parsed = parseConsoleArgs(
      ["--port", "3211", "--instance=1", "--verbose", "--enable-flow", "--host", "0.0.0.0"],
      3214,
    );

    expect(parsed).toEqual({
      consolePort: 3214,
      extraArgs: ["--enable-flow", "--host", "0.0.0.0"],
    });
  });

  it("rejects an unusable console port", () => {
    expect(() => parseConsoleArgs(["--console-port", "70000"], 3114)).toThrow(/between 1 and 65535/);
    expect(() => parseConsoleArgs(["--console-port"], 3114)).toThrow(/--console-port/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRuntimePortArgs,
  renderRuntimeIiiConfig,
} from "../src/cli/runtime-ports.js";

describe("runtime iii port rendering", () => {
  it("derives the full port quartet from --port", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimePortArgs(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("3212");
    expect(env.III_STREAM_PORT).toBe("3212");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("3213");
    expect(env.III_VIEWER_PORT).toBe("3213");
    expect(env.III_ENGINE_PORT).toBe("49234");
    expect(env.III_ENGINE_URL).toBe("ws://localhost:49234");
  });

  it("renders a v0.11-compatible runtime iii config for non-default REST and stream ports", () => {
    const nativeConfig = readFileSync("iii-config.yaml", "utf-8");

    const rendered = renderRuntimeIiiConfig(nativeConfig, {
      III_REST_PORT: "3211",
    });

    expect(nativeConfig).not.toContain("port: 49234");
    expect(rendered.split(/\r?\n/).some((line) => /^port:\s*\d+\s*$/.test(line))).toBe(false);
    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 3212");
    expect(rendered).toContain("http://localhost:3211");
    expect(rendered).toContain("http://localhost:3213");
    expect(rendered).toContain("http://127.0.0.1:3211");
    expect(rendered).toContain("http://127.0.0.1:3213");
  });

  it("keeps explicit sibling port overrides", () => {
    const env: NodeJS.ProcessEnv = {
      III_STREAMS_PORT: "4300",
      III_ENGINE_PORT: "5000",
      III_ENGINE_URL: "ws://127.0.0.1:5000",
      AGENTMEMORY_VIEWER_PORT: "4400",
    };

    applyRuntimePortArgs(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("4300");
    expect(env.III_ENGINE_PORT).toBe("5000");
    expect(env.III_ENGINE_URL).toBe("ws://127.0.0.1:5000");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("4400");
  });
});

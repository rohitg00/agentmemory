import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRuntimePortArgs,
  renderRuntimeIiiConfig,
} from "../src/cli/runtime-ports.js";

describe("runtime iii port rendering", () => {
  it("derives runtime worker ports from --port without moving the native engine", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimePortArgs(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("3212");
    expect(env.III_STREAM_PORT).toBe("3212");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("3213");
    expect(env.III_VIEWER_PORT).toBe("3213");
    expect(env.III_ENGINE_PORT).toBeUndefined();
    expect(env.III_ENGINE_URL).toBeUndefined();
  });

  it("accepts the highest REST anchor whose derived worker ports are valid", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimePortArgs(["--port", "65533"], env);

    expect(env.III_REST_PORT).toBe("65533");
    expect(env.III_STREAMS_PORT).toBe("65534");
    expect(env.III_STREAM_PORT).toBe("65534");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("65535");
    expect(env.III_VIEWER_PORT).toBe("65535");
  });

  it("rejects REST anchors whose derived worker ports exceed the TCP range", () => {
    for (const requestedPort of ["65534", "65535"]) {
      const env: NodeJS.ProcessEnv = {};

      applyRuntimePortArgs(["--port", requestedPort], env);

      expect(env.III_REST_PORT).toBeUndefined();
      expect(env.III_STREAMS_PORT).toBeUndefined();
      expect(env.III_STREAM_PORT).toBeUndefined();
      expect(env.AGENTMEMORY_VIEWER_PORT).toBeUndefined();
      expect(env.III_VIEWER_PORT).toBeUndefined();
    }
  });

  it("renders a runtime iii config for non-default port blocks", () => {
    const nativeConfig = readFileSync("iii-config.yaml", "utf-8");

    const rendered = renderRuntimeIiiConfig(nativeConfig, {
      III_REST_PORT: "3211",
    });

    expect(nativeConfig).not.toContain("port: 49234");
    expect(rendered).toMatch(/^workers:\n/);
    expect(rendered).not.toMatch(/^port:\s*\d+/m);
    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 3212");
    expect(rendered).toContain("http://localhost:3211");
    expect(rendered).toContain("http://localhost:3213");
    expect(rendered).toContain("http://127.0.0.1:3211");
    expect(rendered).toContain("http://127.0.0.1:3213");
  });

  it("removes unsupported top-level engine ports from legacy runtime configs", () => {
    const rendered = renderRuntimeIiiConfig(
      ["port: 49234", "", readFileSync("iii-config.yaml", "utf-8")].join("\n"),
      { III_REST_PORT: "3211" },
    );

    expect(rendered).toMatch(/^workers:\n/);
    expect(rendered).not.toMatch(/^port:\s*\d+/m);
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

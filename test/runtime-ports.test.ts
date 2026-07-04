import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPortFlag, renderRuntimeIiiConfig } from "../src/cli/runtime-ports.js";

describe("runtime port derivation (#750)", () => {
  it("derives sibling ports when --port targets a non-default instance", () => {
    const env: NodeJS.ProcessEnv = {};
    applyPortFlag(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("3212");
    expect(env.III_STREAM_PORT).toBe("3212");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("3213");
    expect(env.III_VIEWER_PORT).toBe("3213");
    expect(env.III_PORT).toBe("49234");
    expect(env.III_ENGINE_PORT).toBe("49234");
    expect(env.III_ENGINE_URL).toBe("ws://localhost:49234");
  });

  it("respects explicit sibling port overrides", () => {
    const env: NodeJS.ProcessEnv = {
      III_STREAMS_PORT: "4300",
      III_PORT: "49000",
      III_ENGINE_URL: "ws://127.0.0.1:49000",
      AGENTMEMORY_VIEWER_PORT: "4400",
    };
    applyPortFlag(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("4300");
    expect(env.III_STREAM_PORT).toBeUndefined();
    expect(env.III_PORT).toBe("49000");
    expect(env.III_ENGINE_PORT).toBeUndefined();
    expect(env.III_ENGINE_URL).toBe("ws://127.0.0.1:49000");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBe("4400");
    expect(env.III_VIEWER_PORT).toBeUndefined();
  });

  it("does not shadow explicit lower-priority sibling overrides", () => {
    const env: NodeJS.ProcessEnv = {
      III_STREAMS_PORT: "4300",
      III_VIEWER_PORT: "4400",
      III_PORT: "49000",
    };
    applyPortFlag(["--port", "3211"], env);

    expect(env.III_REST_PORT).toBe("3211");
    expect(env.III_STREAMS_PORT).toBe("4300");
    expect(env.III_STREAM_PORT).toBeUndefined();
    expect(env.III_VIEWER_PORT).toBe("4400");
    expect(env.AGENTMEMORY_VIEWER_PORT).toBeUndefined();
    expect(env.III_PORT).toBe("49000");
    expect(env.III_ENGINE_PORT).toBeUndefined();
    expect(env.III_ENGINE_URL).toBeUndefined();
  });

  it("matches loadConfig precedence when rendering runtime ports", () => {
    const nativeConfig = readFileSync("iii-config.yaml", "utf-8");
    const rendered = renderRuntimeIiiConfig(nativeConfig, {
      III_REST_PORT: "3211",
      III_STREAMS_PORT: "4300",
      III_STREAM_PORT: "4301",
      III_PORT: "49000",
      III_ENGINE_PORT: "49001",
      III_ENGINE_URL: "ws://127.0.0.1:49002",
    });

    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 4301");
    expect(rendered).toContain("port: 49002");
    expect(rendered).not.toContain("port: 4300");
    expect(rendered).not.toContain("port: 49000");
    expect(rendered).not.toContain("port: 49001");
  });

  it("ignores --port values that would overflow derived sibling ports", () => {
    const env: NodeJS.ProcessEnv = {};
    applyPortFlag(["--port", "65533"], env);

    expect(env.III_REST_PORT).toBeUndefined();
    expect(env.III_STREAMS_PORT).toBeUndefined();
    expect(env.AGENTMEMORY_VIEWER_PORT).toBeUndefined();
    expect(env.III_ENGINE_PORT).toBeUndefined();
    expect(env.III_ENGINE_URL).toBeUndefined();
  });

  it("renders a runtime iii config with derived ports without changing bundled defaults", () => {
    const nativeConfig = readFileSync("iii-config.yaml", "utf-8");
    const rendered = renderRuntimeIiiConfig(nativeConfig, {
      III_REST_PORT: "3211",
      III_STREAMS_PORT: "3212",
      III_PORT: "49234",
    });

    expect(nativeConfig).toContain("port: 3111");
    expect(nativeConfig).toContain("port: 3112");
    expect(rendered).toContain("port: 49234");
    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 3212");
  });
});

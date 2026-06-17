import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeEnvFileValues,
  applyRuntimeHostArgs,
  applyRuntimePortArgs,
  assertRuntimeHostAllowed,
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

  it("renders a v0.11-compatible runtime iii config for non-default REST and stream ports", () => {
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

  it("applies --host to the runtime host environment", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimeHostArgs(["--host", "0.0.0.0"], env);

    expect(env.AGENTMEMORY_HOST).toBe("0.0.0.0");
  });

  it("applies --host=value to the runtime host environment", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimeHostArgs(["--host=192.168.1.10"], env);

    expect(env.AGENTMEMORY_HOST).toBe("192.168.1.10");
  });

  it("applies runtime .env values without overriding shell values", () => {
    const env: NodeJS.ProcessEnv = {
      AGENTMEMORY_HOST: "127.0.0.1",
    };

    applyRuntimeEnvFileValues(
      {
        AGENTMEMORY_HOST: "0.0.0.0 # expose on LAN",
        AGENTMEMORY_SECRET: "secret # required for LAN",
        III_REST_PORT: "3211",
      },
      env,
    );

    expect(env.AGENTMEMORY_HOST).toBe("127.0.0.1");
    expect(env.AGENTMEMORY_SECRET).toBe("secret");
    expect(env.III_REST_PORT).toBe("3211");
  });

  it("renders configured runtime host for REST and streams workers only", () => {
    const nativeConfig = readFileSync("iii-config.yaml", "utf-8");

    const rendered = renderRuntimeIiiConfig(nativeConfig, {
      AGENTMEMORY_HOST: "0.0.0.0",
      III_REST_PORT: "3211",
    });

    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 3212");
    expect(rendered).toContain("http://localhost:3211");
    expect(rendered).toMatch(/name: iii-http[\s\S]*?host: 0\.0\.0\.0/);
    expect(rendered).toMatch(/name: iii-stream[\s\S]*?host: 0\.0\.0\.0/);
    expect(rendered).toMatch(/name: iii-observability[\s\S]*?logs_console_output: false/);
  });

  it("requires a secret before rendering a non-loopback runtime host", () => {
    expect(() =>
      assertRuntimeHostAllowed({ AGENTMEMORY_HOST: "0.0.0.0" }),
    ).toThrow(/AGENTMEMORY_SECRET/);

    expect(() =>
      assertRuntimeHostAllowed({
        AGENTMEMORY_HOST: "0.0.0.0",
        AGENTMEMORY_SECRET: "secret",
      }),
    ).not.toThrow();
    expect(() =>
      assertRuntimeHostAllowed({ AGENTMEMORY_HOST: "127.0.0.1" }),
    ).not.toThrow();
  });

  it("rejects malformed runtime hosts before rendering yaml", () => {
    expect(() =>
      renderRuntimeIiiConfig("workers:\n", {
        AGENTMEMORY_HOST: "0.0.0.0\n  port: 1",
        AGENTMEMORY_SECRET: "secret",
      }),
    ).toThrow(/AGENTMEMORY_HOST must be/);
    expect(() =>
      renderRuntimeIiiConfig("workers:\n", {
        AGENTMEMORY_HOST: "127.0.0.1:3111",
        AGENTMEMORY_SECRET: "secret",
      }),
    ).toThrow(/AGENTMEMORY_HOST must be/);
  });
});

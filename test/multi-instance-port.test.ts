import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const PORT_ENVS = [
  "III_REST_PORT",
  "III_STREAM_PORT",
  "III_STREAMS_PORT",
  "III_ENGINE_PORT",
  "III_ENGINE_URL",
  "AGENTMEMORY_VIEWER_PORT",
  "III_VIEWER_PORT",
] as const;

const insecureWs = (target: string) => ["ws", "://", target].join("");

describe("multi-instance port auto-derive (#750)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of PORT_ENVS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of PORT_ENVS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it("default REST anchor yields canonical REST, streams, and engine defaults", () => {
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3111);
    expect(cfg.streamsPort).toBe(3112);
    expect(cfg.viewerPort).toBe(3113);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("relocating REST drags streams but leaves the native engine default alone", () => {
    process.env["III_REST_PORT"] = "3211";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.viewerPort).toBe(3213);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("relocating REST derives the viewer port from the same REST anchor", () => {
    process.env["III_REST_PORT"] = "3211";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.viewerPort).toBe(3213);
  });

  it("instance N=2 REST block (3311) lands on streams 3312 with default engine", () => {
    process.env["III_REST_PORT"] = "3311";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3311);
    expect(cfg.streamsPort).toBe(3312);
    expect(cfg.viewerPort).toBe(3313);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("ignores REST anchors whose derived streams port exceeds the TCP range", () => {
    process.env["III_REST_PORT"] = "65535";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3111);
    expect(cfg.streamsPort).toBe(3112);
    expect(cfg.viewerPort).toBe(3113);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("explicit III_STREAM_PORT pins streams without affecting REST or engine", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_STREAM_PORT"] = "9999";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(9999);
    expect(cfg.viewerPort).toBe(3213);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("legacy III_STREAMS_PORT still honored", () => {
    process.env["III_STREAMS_PORT"] = "9000";
    const cfg = loadConfig();
    expect(cfg.streamsPort).toBe(9000);
  });

  it("explicit AGENTMEMORY_VIEWER_PORT pins viewer without affecting REST, streams, or engine", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["AGENTMEMORY_VIEWER_PORT"] = "4400";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.viewerPort).toBe(4400);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("legacy III_VIEWER_PORT is honored when AGENTMEMORY_VIEWER_PORT is unset", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_VIEWER_PORT"] = "4500";
    const cfg = loadConfig();
    expect(cfg.viewerPort).toBe(4500);
  });

  it("AGENTMEMORY_VIEWER_PORT wins over legacy III_VIEWER_PORT", () => {
    process.env["AGENTMEMORY_VIEWER_PORT"] = "4400";
    process.env["III_VIEWER_PORT"] = "4500";
    const cfg = loadConfig();
    expect(cfg.viewerPort).toBe(4400);
  });

  it("invalid explicit viewer port falls back to the REST-derived viewer port", () => {
    process.env["III_REST_PORT"] = "3211";
    for (const [primary, legacy] of [
      ["not-a-port", "also-invalid"],
      ["4400abc", "4500abc"],
      ["1.5", "2.5"],
    ]) {
      process.env["AGENTMEMORY_VIEWER_PORT"] = primary;
      process.env["III_VIEWER_PORT"] = legacy;
      const cfg = loadConfig();
      expect(cfg.viewerPort).toBe(3213);
    }
  });

  it("explicit III_ENGINE_PORT points clients at an external engine without affecting REST/streams", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_PORT"] = "55555";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.viewerPort).toBe(3213);
    expect(cfg.engineUrl).toBe("ws://localhost:55555");
  });

  it("legacy III_ENGINE_URL points clients at an external engine", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_URL"] = insecureWs("remote-host:49999");
    const cfg = loadConfig();
    expect(cfg.engineUrl).toBe(insecureWs("remote-host:49999"));
  });
});

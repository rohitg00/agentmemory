import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const PORT_ENVS = [
  "III_REST_PORT",
  "III_STREAM_PORT",
  "III_STREAMS_PORT",
  "III_ENGINE_PORT",
  "III_ENGINE_URL",
] as const;

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

  it("default REST anchor yields canonical 3111/3112/49134 quartet", () => {
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3111);
    expect(cfg.streamsPort).toBe(3112);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("relocating REST drags streams + engine with it", () => {
    process.env["III_REST_PORT"] = "3211";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.engineUrl).toBe("ws://localhost:49234");
  });

  it("instance N=2 block (3311) lands on 3312 + 49334", () => {
    process.env["III_REST_PORT"] = "3311";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3311);
    expect(cfg.streamsPort).toBe(3312);
    expect(cfg.engineUrl).toBe("ws://localhost:49334");
  });

  it("explicit III_STREAM_PORT pins streams without affecting REST/engine", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_STREAM_PORT"] = "9999";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(9999);
    expect(cfg.engineUrl).toBe("ws://localhost:49234");
  });

  it("legacy III_STREAMS_PORT still honored", () => {
    process.env["III_STREAMS_PORT"] = "9000";
    const cfg = loadConfig();
    expect(cfg.streamsPort).toBe(9000);
  });

  it("explicit III_ENGINE_PORT pins engine without affecting REST/streams", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_PORT"] = "55555";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.streamsPort).toBe(3212);
    expect(cfg.engineUrl).toBe("ws://localhost:55555");
  });

  it("legacy III_ENGINE_URL overrides derivation entirely", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_URL"] = "ws://remote-host:49999";
    const cfg = loadConfig();
    expect(cfg.engineUrl).toBe("ws://remote-host:49999");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const PORT_ENVS = [
  "III_REST_PORT",
  "III_VIEWER_PORT",
  "III_ENGINE_PORT",
  "III_ENGINE_URL",
  "III_URL",
] as const;

describe("multi-instance port auto-derive", () => {
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

  it("default REST anchor yields REST/viewer/engine ports", () => {
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3111);
    expect(cfg.viewerPort).toBe(3113);
    expect(cfg.engineUrl).toBe("ws://localhost:49134");
  });

  it("relocating REST drags viewer + engine with it", () => {
    process.env["III_REST_PORT"] = "3211";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.viewerPort).toBe(3213);
    expect(cfg.engineUrl).toBe("ws://localhost:49234");
  });

  it("instance N=2 block (3311) lands on viewer 3313 + engine 49334", () => {
    process.env["III_REST_PORT"] = "3311";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3311);
    expect(cfg.engineUrl).toBe("ws://localhost:49334");
  });

  it("explicit III_ENGINE_PORT pins engine without affecting REST/viewer", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_PORT"] = "55555";
    const cfg = loadConfig();
    expect(cfg.restPort).toBe(3211);
    expect(cfg.engineUrl).toBe("ws://localhost:55555");
  });

  it("explicit III_VIEWER_PORT pins the viewer", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_VIEWER_PORT"] = "7777";
    const cfg = loadConfig();
    expect(cfg.viewerPort).toBe(7777);
  });

  it("Compose-reserved III_URL overrides the derived bridge endpoint", () => {
    process.env["III_REST_PORT"] = "3511";
    process.env["III_URL"] = "ws://127.0.0.1:49534";
    expect(loadConfig().engineUrl).toBe("ws://127.0.0.1:49534");
  });

  it("legacy III_ENGINE_URL overrides derivation entirely", () => {
    process.env["III_REST_PORT"] = "3211";
    process.env["III_ENGINE_URL"] = "ws://remote-host:49999";
    const cfg = loadConfig();
    expect(cfg.engineUrl).toBe("ws://remote-host:49999");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveViewerHost, startViewerServer } from "../src/viewer/server.js";

describe("resolveViewerHost", () => {
  const originalEnv = process.env.AGENTMEMORY_VIEWER_HOST;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_VIEWER_HOST;
    } else {
      process.env.AGENTMEMORY_VIEWER_HOST = originalEnv;
    }
  });

  it("defaults to 127.0.0.1 when AGENTMEMORY_VIEWER_HOST is unset", () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    expect(resolveViewerHost()).toBe("127.0.0.1");
  });

  it("defaults to 127.0.0.1 when AGENTMEMORY_VIEWER_HOST is empty", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "";
    expect(resolveViewerHost()).toBe("127.0.0.1");
  });

  it("returns the configured value when AGENTMEMORY_VIEWER_HOST is set", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "::";
    expect(resolveViewerHost()).toBe("::");
  });

  it("trims surrounding whitespace", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "  ::1  ";
    expect(resolveViewerHost()).toBe("::1");
  });
});

describe("startViewerServer host binding", () => {
  const originalEnv = process.env.AGENTMEMORY_VIEWER_HOST;
  let server: Server | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    logSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_VIEWER_HOST;
    } else {
      process.env.AGENTMEMORY_VIEWER_HOST = originalEnv;
    }
  });

  async function waitForListening(s: Server): Promise<void> {
    if (s.listening) return;
    await new Promise<void>((resolve) => s.once("listening", () => resolve()));
  }

  it("binds to 127.0.0.1 by default — preserves loopback-only security", async () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    server = startViewerServer(0, null, null);
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe("127.0.0.1");
  });

  it("binds to AGENTMEMORY_VIEWER_HOST when set — covers the deploy/fly fix for #434", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "::1";
    server = startViewerServer(0, null, null);
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe("::1");
  });
});

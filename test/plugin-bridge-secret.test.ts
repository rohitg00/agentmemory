import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginBridge } from "../src/mcp/plugin-bridge.js";

const local = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (original) => ({
  ...await original<typeof import("node:os")>(),
  homedir: () => local.home,
}));

beforeEach(() => {
  local.home = mkdtempSync(join(tmpdir(), "agentmemory-bridge-secret-"));
  mkdirSync(join(local.home, ".agentmemory"));
  vi.stubEnv("AGENTMEMORY_URL", "http://127.0.0.1:3111");
  vi.stubEnv("AGENTMEMORY_SECRET", "");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response('{"tools":[]}')));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(local.home, { recursive: true, force: true });
});

function store(name: string, value: string) {
  writeFileSync(join(local.home, ".agentmemory", name), value, { mode: 0o600 });
}

function authorization() {
  return (vi.mocked(fetch).mock.lastCall?.[1]?.headers as Record<string, string>).authorization;
}

describe("plugin bridge uses the daemon's local credential resolution", () => {
  it("reads the generated credential without an MCP environment override", async () => {
    store("secret", "generated-test-secret\n");
    await createPluginBridge()("tools/list", {});
    expect(authorization()).toBe("Bearer generated-test-secret");
  });

  it("prefers the local .env credential over the generated file", async () => {
    store("secret", "generated-test-secret\n");
    store(".env", 'AGENTMEMORY_SECRET="configured-test-secret"\n');
    await createPluginBridge()("tools/list", {});
    expect(authorization()).toBe("Bearer configured-test-secret");
  });

  it("prefers an explicit host credential over local files", async () => {
    store("secret", "generated-test-secret\n");
    store(".env", "AGENTMEMORY_SECRET=configured-test-secret\n");
    vi.stubEnv("AGENTMEMORY_SECRET", "explicit-test-secret");
    await createPluginBridge()("tools/list", {});
    expect(authorization()).toBe("Bearer explicit-test-secret");
  });

  it("picks up a credential created or rotated after the bridge starts", async () => {
    const bridge = createPluginBridge();
    store("secret", "first-test-secret\n");
    await bridge("tools/list", {});
    expect(authorization()).toBe("Bearer first-test-secret");
    store("secret", "rotated-test-secret\n");
    await bridge("tools/list", {});
    expect(authorization()).toBe("Bearer rotated-test-secret");
  });

  it.each(["https://memory.example", "http://localhost.example", "http://127.0.0.1.example"])(
    "never forwards local credential files to a remote URL: %s", async (url) => {
      store("secret", "generated-test-secret\n");
      store(".env", "AGENTMEMORY_SECRET=configured-test-secret\n");
      vi.stubEnv("AGENTMEMORY_URL", url);
      vi.stubEnv("AGENTMEMORY_SECRET", "${AGENTMEMORY_SECRET}");
      await createPluginBridge()("tools/list", {});
      expect(authorization()).toBeUndefined();
    },
  );
});

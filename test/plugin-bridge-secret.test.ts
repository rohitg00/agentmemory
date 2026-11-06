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

function requestedUrl() {
  return String(vi.mocked(fetch).mock.lastCall?.[0]);
}

describe("plugin bridge reads Claude Code plugin settings", () => {
  it("prefers the plugin URL and secret settings over the environment", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "https://env.example");
    vi.stubEnv("AGENTMEMORY_SECRET", "env-test-secret");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL", "https://chosen.example");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET", "chosen-test-secret");
    await createPluginBridge()("tools/list", {});
    expect(requestedUrl()).toBe("https://chosen.example/agentmemory/mcp/tools");
    expect(authorization()).toBe("Bearer chosen-test-secret");
  });

  it("falls back to AGENTMEMORY_URL when the URL setting is empty", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "https://env.example");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL", "");
    await createPluginBridge()("tools/list", {});
    expect(requestedUrl()).toBe("https://env.example/agentmemory/mcp/tools");
  });

  it("uses http://localhost:3111 when both URL sources are empty", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL", "");
    await createPluginBridge()("tools/list", {});
    expect(requestedUrl()).toBe("http://localhost:3111/agentmemory/mcp/tools");
  });

  it("does not send the environment secret when the secret setting is empty", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "https://env.example");
    vi.stubEnv("AGENTMEMORY_SECRET", "env-test-secret");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET", "");
    await createPluginBridge()("tools/list", {});
    expect(authorization()).toBeUndefined();
  });

  it("still reads the local secret for a loopback URL when the secret setting is empty", async () => {
    store("secret", "generated-test-secret\n");
    vi.stubEnv("AGENTMEMORY_SECRET", "env-test-secret");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET", "");
    await createPluginBridge()("tools/list", {});
    expect(authorization()).toBe("Bearer generated-test-secret");
  });

  it("ignores unsubstituted placeholders in the plugin settings", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "https://env.example");
    vi.stubEnv("AGENTMEMORY_SECRET", "env-test-secret");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL", "${user_config.agentmemory_url}");
    vi.stubEnv("CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET", "${user_config.agentmemory_secret}");
    await createPluginBridge()("tools/list", {});
    expect(requestedUrl()).toBe("https://env.example/agentmemory/mcp/tools");
    expect(authorization()).toBeUndefined();
  });
});

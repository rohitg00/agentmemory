import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const expectedHermesHooks = [
  "prefetch",
  "sync_turn",
  "on_session_end",
  "on_pre_compress",
  "on_memory_write",
  "system_prompt_block",
];

function readHermesPluginHooks(): string[] {
  const manifest = readFileSync("integrations/hermes/plugin.yaml", "utf8");
  const hooks: string[] = [];
  let inHooks = false;

  for (const line of manifest.split(/\r?\n/)) {
    if (line.trim() === "hooks:") {
      inHooks = true;
      continue;
    }
    if (!inHooks) continue;
    if (line.trim() === "") continue;
    if (!line.startsWith(" ")) break;

    const match = line.match(/^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (match) hooks.push(match[1]);
  }

  return hooks;
}

function isHermesLifecycleHook(methodName: string): boolean {
  return (
    methodName === "prefetch" ||
    methodName === "sync_turn" ||
    methodName === "system_prompt_block" ||
    methodName.startsWith("on_")
  );
}

function readAgentMemoryProviderHookMethods(): string[] {
  const source = readFileSync("integrations/hermes/__init__.py", "utf8");
  const methods: string[] = [];
  const providerMethodPattern = /^    def ([a-z_][a-z0-9_]*)\(/gm;

  for (const match of source.matchAll(providerMethodPattern)) {
    const methodName = match[1];
    if (isHermesLifecycleHook(methodName)) methods.push(methodName);
  }

  return methods;
}

describe("Hermes plugin manifest", () => {
  it("declares every implemented lifecycle hook", () => {
    const declaredHooks = readHermesPluginHooks();
    const implementedHooks = readAgentMemoryProviderHookMethods();

    expect([...declaredHooks].sort()).toEqual([...implementedHooks].sort());
    expect(declaredHooks).toEqual(expectedHermesHooks);
  });

  it("preloads AGENTMEMORY_URL default at import time", () => {
    const source = readFileSync("integrations/hermes/__init__.py", "utf8");
    expect(source).toMatch(
      /os\.environ\.setdefault\(\s*["']AGENTMEMORY_URL["']\s*,\s*DEFAULT_BASE_URL\s*\)/,
    );
  });

  it("forwards the configured agent identity and caller token", () => {
    const script = String.raw`
import importlib.util

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

seen = []
class FakeResponse:
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        return False
    def read(self):
        return b'{"success": true}'

def fake_urlopen(req, timeout=0):
    seen.append({key.lower(): value for key, value in req.header_items()})
    return FakeResponse()

mod.urlopen = fake_urlopen
result = mod._api("http://localhost:3111", "smart-search", {"query": "auth"})
assert result == {"success": True}, result
assert seen[0]["authorization"] == "Bearer api-secret", seen[0]
assert seen[0]["x-agentmemory-agent-id"] == "hermes-agent", seen[0]
assert seen[0]["x-agentmemory-caller-token"] == "hermes-caller-secret", seen[0]
`;
    const emptyConfigDir = join(
      tmpdir(),
      `agentmemory-hermes-caller-test-${process.pid}`,
    );
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: emptyConfigDir,
        XDG_CONFIG_HOME: emptyConfigDir,
        AGENTMEMORY_SECRET: "api-secret",
        AGENT_ID: "hermes-agent",
        AGENTMEMORY_CALLER_TOKEN: "hermes-caller-secret",
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});

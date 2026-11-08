import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const PYTHON = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();

const expectedHermesHooks = [
  "on_turn_start",
  "prefetch",
  "sync_turn",
  "on_session_end",
  "on_session_switch",
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

  it("satisfies native provider runtime and credential contracts", () => {
    const result = spawnSync(PYTHON, ["test/hermes-provider-contracts.py", "-v"], {
      encoding: "utf8",
      timeout: 60_000,
      env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1" },
    });
    const diagnostics = [result.error?.message, result.signal, result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n");
    expect(result.status, diagnostics).toBe(0);
  }, 70_000);
});

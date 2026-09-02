import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

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

  // #745: on_session_end fires at genuine session end (not per-turn, unlike
  // a Stop-hook-style call), so it must set final=True or the session sits
  // "active" forever and can trip the stale-session diagnostic - the same
  // fix already applied to every other first-party integration
  // (src/hooks/session-end.ts, plugin/opencode/agentmemory-capture.ts,
  // integrations/pi/index.ts). This is a structural (source-regex) test,
  // not a behavioural one, matching the idiom test/evict.test.ts's
  // "eviction scheduling" describe block uses for the same reason: no
  // Python runtime is available to exercise the plugin directly here.
  it("marks the session/end call final on genuine session end", () => {
    const source = readFileSync("integrations/hermes/__init__.py", "utf8");
    const match = source.match(
      /def on_session_end\(self,[^)]*\)[^:]*:\n((?:.*\n)*?)\n {4}def /,
    );
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/"final":\s*True/);
  });
});

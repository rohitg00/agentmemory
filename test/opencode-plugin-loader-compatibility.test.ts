import { describe, it, expect } from "vitest";

function isServerPlugin(value: any): boolean {
  return typeof value === "function";
}

function getServerPlugin(value: any): any {
  if (isServerPlugin(value)) return value;
  if (!value || typeof value !== "object" || !("server" in value)) return;
  if (!isServerPlugin(value.server)) return;
  return value.server;
}

// Exact implementation of OpenCode's plugin loader from app.asar
function getLegacyPlugins(mod: any): any[] {
  const seen = new Set();
  const result: any[] = [];
  for (const entry of Object.values(mod)) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    const plugin = getServerPlugin(entry);
    if (!plugin) throw new TypeError("Plugin export is not a function");
    result.push(plugin);
  }
  return result;
}

describe("OpenCode plugin loader compatibility", () => {
  it("exports only valid Plugin functions to satisfy OpenCode getLegacyPlugins", async () => {
    const mod = await import("../plugin/opencode/agentmemory-capture.ts");
    
    // OpenCode loads the module and runs getLegacyPlugins
    const plugins = getLegacyPlugins(mod);
    
    // Must find exactly 1 unique plugin function
    expect(plugins.length).toBe(1);
    
    // When OpenCode executes the plugin function, it must not throw and must return plugin hooks
    const pluginFn = plugins[0];
    const input = {
      worktree: "/tmp/project",
      directory: "/tmp/project",
      project: { id: "test-proj", directory: "/tmp/project" },
    };
    const options = undefined;
    
    const hooks = await pluginFn(input, options);
    expect(hooks).toBeDefined();
    expect(typeof hooks.event).toBe("function");
    expect(typeof hooks.config).toBe("function");
    expect(typeof hooks["tool.execute.before"]).toBe("function");
    expect(typeof hooks["chat.message"]).toBe("function");
  });
});

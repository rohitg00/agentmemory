import type { ConnectAdapter, ConnectOptions, ConnectResult, HookState } from "./types.js";

export function hookState(result: ConnectResult): HookState {
  return result.kind === "installed" || result.kind === "already-wired" ? "installed" : "skipped";
}

export function mcpOnlyCaptureNotice(
  adapter: Pick<ConnectAdapter, "displayName" | "autoCapture">,
  opts: Pick<ConnectOptions, "withHooks">,
  result: ConnectResult,
): string | null {
  if (result.kind !== "installed" && result.kind !== "already-wired") return null;
  const mode = adapter.autoCapture;
  if (mode === "built-in" || result.hooks === "installed") return null;
  const lead = `${adapter.displayName}: MCP only. Nothing is captured automatically`;
  if (opts.withHooks && mode === "with-hooks") {
    return `${lead} because the hooks were not installed. Fix the problem reported above, then rerun with --with-hooks.`;
  }
  if (opts.withHooks && mode === "plugin-or-with-hooks") {
    return `${adapter.displayName}: MCP only. The hooks were not installed, so nothing is captured automatically unless the agentmemory plugin is installed. Fix the problem reported above and rerun with --with-hooks, or install the plugin.`;
  }
  switch (mode) {
    case "with-hooks":
      return `${lead}. Rerun with --with-hooks to capture sessions automatically.`;
    case "plugin":
      return `${lead} unless the agentmemory plugin for ${adapter.displayName} is installed. Without it, the agent must call memory_save to store anything.`;
    case "plugin-or-with-hooks":
      return `${lead} unless the agentmemory plugin is installed. Install the plugin, or rerun with --with-hooks.`;
    default:
      return `${lead}. The agent must call memory_save to store anything.`;
  }
}

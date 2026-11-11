import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

export function mcpOnlyCaptureNotice(
  adapter: Pick<ConnectAdapter, "displayName" | "autoCapture">,
  opts: Pick<ConnectOptions, "withHooks">,
  result: ConnectResult,
): string | null {
  if (result.kind !== "installed" && result.kind !== "already-wired") return null;
  const mode = adapter.autoCapture;
  if (mode === "built-in") return null;
  if (opts.withHooks && (mode === "with-hooks" || mode === "plugin-or-with-hooks")) return null;
  const lead = `${adapter.displayName}: MCP only. Nothing is captured automatically`;
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

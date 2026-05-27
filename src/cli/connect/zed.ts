import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Zed stores its settings (including MCP servers) under "context_servers"
// in settings.json — NOT "mcpServers". macOS uses
// ~/.config/zed/settings.json by default; Zed also reads from
// ~/Library/Application Support/Zed/settings.json on macOS but the
// XDG path is the documented primary. Linux: ~/.config/zed/settings.json.
// Source: zed.dev/docs/ai/mcp
const isMac = platform() === "darwin";
const zedConfigDir = isMac
  ? join(homedir(), ".config", "zed")
  : join(homedir(), ".config", "zed");

export const adapter = createJsonMcpAdapter({
  name: "zed",
  displayName: "Zed",
  detectDir: zedConfigDir,
  configPath: join(zedConfigDir, "settings.json"),
  wrapperKey: "context_servers",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.config/zed/settings.json (key: context_servers).",
});

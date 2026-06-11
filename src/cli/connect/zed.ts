import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Zed stores its settings (including MCP servers) under "context_servers"
// in settings.json — NOT "mcpServers". User config lives at
// ~/.config/zed/settings.json on all platforms (Zed uses the XDG path
// even on macOS; ~/Library/Application Support/Zed/ holds runtime data
// like the database + cached language servers, not the config).
// Source: zed.dev/docs/ai/mcp + zed.dev/docs/configuring-zed
const zedConfigDir = join(homedir(), ".config", "zed");

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

import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Antigravity stores MCP config in mcp_config.json under its app
// support directory. The schema follows the standard MCP envelope —
// `{ mcpServers: { ... } }`. Path varies by platform:
//   macOS:   ~/Library/Application Support/Antigravity/User/mcp_config.json
//   Linux:   ~/.config/Antigravity/User/mcp_config.json
//   Windows: %APPDATA%/Antigravity/User/mcp_config.json
// Connect is gated on win32 elsewhere; we cover macOS + Linux here.
const ANTIGRAVITY_DIR =
  platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "Antigravity", "User")
    : join(homedir(), ".config", "Antigravity", "User");

export const adapter = createJsonMcpAdapter({
  name: "antigravity",
  displayName: "Antigravity",
  detectDir: ANTIGRAVITY_DIR,
  configPath: join(ANTIGRAVITY_DIR, "mcp_config.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via mcp_config.json. Antigravity replaces Gemini CLI (sunset 2026-06-18).",
});

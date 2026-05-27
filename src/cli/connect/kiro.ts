import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Kiro stores user-level MCP servers in ~/.kiro/settings/mcp.json.
// Schema follows the standard MCP envelope { mcpServers: { ... } }.
// Source: kiro.dev/docs/cli/mcp
export const adapter = createJsonMcpAdapter({
  name: "kiro",
  displayName: "Kiro",
  detectDir: join(homedir(), ".kiro"),
  configPath: join(homedir(), ".kiro", "settings", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.kiro/settings/mcp.json (user-level). Workspace overrides live in .kiro/settings/mcp.json.",
});

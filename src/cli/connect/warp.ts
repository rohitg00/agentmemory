import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Warp stores MCP server config at ~/.warp/.mcp.json with the
// canonical `mcpServers` wrapper — identical schema to Claude Code.
// Warp also auto-discovers skills from .claude/skills/ so the
// agentmemory plugin's 8 skills are surfaced natively once the
// Claude Code plugin is installed.
// Source: docs.warp.dev/agent-platform/capabilities/mcp/
export const adapter = createJsonMcpAdapter({
  name: "warp",
  displayName: "Warp",
  detectDir: join(homedir(), ".warp"),
  configPath: join(homedir(), ".warp", ".mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.warp/.mcp.json. Skills auto-discover from .claude/skills/ if the Claude Code plugin is also installed.",
});

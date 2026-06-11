import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Cline CLI stores MCP server config at ~/.cline/mcp.json with the
// canonical `mcpServers` wrapper — same schema as Claude Code with
// optional `disabled` and `autoApprove` fields per entry.
// VS Code extension users manage MCP through Cline's Settings UI;
// this adapter targets the standalone CLI surface.
// Source: github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx
export const adapter = createJsonMcpAdapter({
  name: "cline",
  displayName: "Cline",
  detectDir: join(homedir(), ".cline"),
  configPath: join(homedir(), ".cline", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.cline/mcp.json (CLI). VS Code users: add the same block via Cline Settings → MCP Servers → Edit JSON.",
});

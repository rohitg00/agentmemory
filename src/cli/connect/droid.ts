import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Factory.ai's Droid CLI stores MCP server config at ~/.factory/mcp.json
// with the canonical `mcpServers` wrapper. Project-scoped overrides live
// at <repo>/.factory/mcp.json. Each entry adds an optional `type` field
// ("stdio" | "http") and `disabled` boolean — agentmemory's stdio block
// works against the same shape without needing the explicit type tag.
// Source: docs.factory.ai/cli/configuration/mcp
export const adapter = createJsonMcpAdapter({
  name: "droid",
  displayName: "Droid (Factory.ai)",
  detectDir: join(homedir(), ".factory"),
  configPath: join(homedir(), ".factory", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.factory/mcp.json. The `/mcp` slash command inside droid lists configured servers.",
  // Droid requires `type` per the documented schema. stdio for npx-spawned shim.
  extraEntryFields: { type: "stdio" },
});

import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "bob",
  displayName: "IBM Bob",
  detectDir: join(homedir(), ".bob"),
  configPath: join(homedir(), ".bob", "settings", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#bob",
  protocolNote:
    "→ Using MCP. Runs the agentmemory server at localhost:3111.",
});

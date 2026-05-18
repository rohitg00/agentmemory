import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "cursor",
  displayName: "Cursor",
  detectDir: join(homedir(), ".cursor"),
  configPath: join(homedir(), ".cursor", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP (the only protocol Cursor speaks). Memory bridge runs at :3111 underneath.",
});

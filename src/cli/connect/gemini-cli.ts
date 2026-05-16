import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "gemini-cli",
  displayName: "Gemini CLI",
  detectDir: join(homedir(), ".gemini"),
  configPath: join(homedir(), ".gemini", "settings.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP (the only protocol Gemini CLI speaks). Memory bridge runs at :3111 underneath.",
});

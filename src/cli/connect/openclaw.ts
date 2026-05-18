import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "openclaw",
  displayName: "OpenClaw",
  detectDir: join(homedir(), ".openclaw"),
  configPath: join(homedir(), ".openclaw", "openclaw.json"),
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/openclaw",
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/openclaw.md.",
});

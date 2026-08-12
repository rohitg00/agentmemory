import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "qoder-clicn",
  displayName: "Qoder CLI CN",
  detectDir: join(homedir(), ".qoder-cn"),
  configPath: join(homedir(), ".qoder-cn", "settings.json"),
  docs: "https://github.com/rohitg00/agentmemory/blob/main/QODER-COMPAT.md",
  protocolNote:
    "→ Using MCP via ~/.qoder-cn/settings.json. For lifecycle hooks and project skills, see QODER-COMPAT.md.",
});

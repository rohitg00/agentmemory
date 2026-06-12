import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Qoder CLI CN (qoderclicn) is a Qwen-derived coding-agent CLI whose
// user config lives at ~/.qoder-cn/settings.json. Its mcpServers schema
// matches the standard JSON shape, so the shared adapter handles the
// wiring. Hooks are configured separately — see QODER-COMPAT.md.
export const adapter = createJsonMcpAdapter({
  name: "qoder-clicn",
  displayName: "Qoder CLI CN",
  detectDir: join(homedir(), ".qoder-cn"),
  configPath: join(homedir(), ".qoder-cn", "settings.json"),
  docs: "https://github.com/rohitg00/agentmemory/blob/main/QODER-COMPAT.md",
  protocolNote:
    "→ Using MCP via ~/.qoder-cn/settings.json. For lifecycle hooks and project skills, see QODER-COMPAT.md.",
});

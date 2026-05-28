import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

// Qwen Code stores its settings (mcpServers + hooks) in
// ~/.qwen/settings.json. Schema for mcpServers matches Claude Code's
// shape, so the shared JSON adapter handles the wiring.
// Source: qwenlm.github.io/qwen-code-docs/en/users/features/mcp
export const adapter = createJsonMcpAdapter({
  name: "qwen",
  displayName: "Qwen Code",
  detectDir: join(homedir(), ".qwen"),
  configPath: join(homedir(), ".qwen", "settings.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.qwen/settings.json. Qwen Code's hook system can also be wired separately — see docs.",
});

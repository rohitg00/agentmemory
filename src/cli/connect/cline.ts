import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

const CLINE_DIR = join(homedir(), ".cline");
const SETTINGS_OVERRIDE = process.env["CLINE_MCP_SETTINGS_PATH"];

export const adapter = {
  ...createJsonMcpAdapter({
    name: "cline",
    displayName: "Cline",
    detectDir: CLINE_DIR,
    configPath: SETTINGS_OVERRIDE || join(CLINE_DIR, "data", "settings", "cline_mcp_settings.json"),
    docs: "https://github.com/rohitg00/agentmemory#other-agents",
    protocolNote:
      "→ Using MCP via ~/.cline/data/settings/cline_mcp_settings.json (CLI), or CLINE_MCP_SETTINGS_PATH when set. VS Code users: add the same block via Cline Settings → MCP Servers → Edit JSON.",
  }),
  detect(): boolean {
    return Boolean(SETTINGS_OVERRIDE) || existsSync(CLINE_DIR);
  },
};

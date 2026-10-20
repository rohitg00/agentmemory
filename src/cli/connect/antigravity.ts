import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";
import { installAntigravityCliHooks } from "./antigravity-cli.js";

const LEGACY_USER_DIR =
  platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "Antigravity", "User")
    : join(homedir(), ".config", "Antigravity", "User");

const CUSTOMIZATION_DIR = join(homedir(), ".gemini", "config");
const mcpAdapter = createJsonMcpAdapter({
  name: "antigravity",
  displayName: "Antigravity",
  detectDir: join(homedir(), ".gemini", "antigravity-ide"),
  configPath: join(CUSTOMIZATION_DIR, "mcp_config.json"),
  extraEntryFields: { env: {} },
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.gemini/config/mcp_config.json, shared by current Antigravity surfaces. Pass --with-hooks for capture through ~/.gemini/config/hooks.json.",
  installHooks: installAntigravityCliHooks,
});

export const adapter = {
  ...mcpAdapter,
  detect: () => mcpAdapter.detect() || existsSync(join(homedir(), ".gemini", "antigravity")) || existsSync(LEGACY_USER_DIR),
};

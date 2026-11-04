import { homedir } from "node:os";
import { join } from "node:path";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";

export const adapter = createJsonMcpAdapter({
  name: "cursor",
  displayName: "Cursor",
  // Cursor speaks lifecycle hooks as well as MCP, so it groups with the
  // native hosts rather than the MCP-only ones.
  category: "native",
  detectDir: join(homedir(), ".cursor"),
  configPath: join(homedir(), ".cursor", "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#cursor",
  // Deliberately no --with-hooks here, unlike Codex and Claude Code. Theirs
  // mirror the plugin's hooks into a user-scope file to work around hosts
  // that fail to dispatch plugin-scope hooks; Cursor dispatches them fine.
  // Writing ~/.cursor/hooks.json as well would just make both copies fire and
  // record every observation twice.
  protocolNote:
    "→ Using MCP. Lifecycle hooks ship in the Cursor plugin: Settings → Plugins → Add marketplace → this repo, then enable agentmemory.",
});

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const HERMES_DIR = join(homedir(), ".hermes");
const HERMES_CONFIG = join(HERMES_DIR, "config.yaml");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes";

export const adapter: ConnectAdapter = {
  name: "hermes",
  displayName: "Hermes Agent",
  docs: DOCS,
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/hermes.md.",

  detect(): boolean {
    return existsSync(HERMES_DIR);
  },

  async install(_opts: ConnectOptions): Promise<ConnectResult> {
    p.log.warn(
      "Hermes uses YAML config. Automated merge isn't implemented yet — manual install required.",
    );
    p.note(
      [
        `Add to ${HERMES_CONFIG}:`,
        "",
        "  mcp_servers:",
        "    agentmemory:",
        "      command: npx",
        '      args: ["-y", "@agentmemory/mcp"]',
        "",
        "  memory:",
        "    provider: agentmemory",
        "",
        `Full guide: ${DOCS}`,
      ].join("\n"),
      "Hermes manual install",
    );
    return {
      kind: "stub",
      reason: "yaml-merge-not-implemented",
    };
  },
};

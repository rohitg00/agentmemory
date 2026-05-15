import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const PI_DIR = join(homedir(), ".pi");
const PI_EXT_DIR = join(PI_DIR, "agent", "extensions", "agentmemory");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi";

export const adapter: ConnectAdapter = {
  name: "pi",
  displayName: "pi",
  docs: DOCS,
  protocolNote:
    "→ Using native hooks (REST API at :3111). MCP not required.",

  detect(): boolean {
    return existsSync(PI_DIR);
  },

  async install(_opts: ConnectOptions): Promise<ConnectResult> {
    p.log.warn(
      "pi uses a TypeScript extension file. Automated copy + register isn't implemented yet — manual install required.",
    );
    p.note(
      [
        "Run these from the agentmemory repo root:",
        "",
        `  mkdir -p ${PI_EXT_DIR}`,
        `  cp integrations/pi/index.ts ${PI_EXT_DIR}/index.ts`,
        `  cp integrations/pi/security.ts ${PI_EXT_DIR}/security.ts`,
        "",
        "Then add to ~/.pi/agent/settings.json:",
        '  { "extensions": ["~/.pi/agent/extensions/agentmemory"] }',
        "",
        `Full guide: ${DOCS}`,
      ].join("\n"),
      "pi manual install",
    );
    return {
      kind: "stub",
      reason: "ts-extension-copy-not-implemented",
    };
  },
};

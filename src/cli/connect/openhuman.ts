import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const OPENHUMAN_DIR = join(homedir(), ".openhuman");
const DOCS = "https://github.com/tinyhumansai/openhuman";

export const adapter: ConnectAdapter = {
  name: "openhuman",
  displayName: "OpenHuman",
  docs: DOCS,
  protocolNote:
    "→ Using native hooks (REST API at :3111). MCP not required.",

  detect(): boolean {
    return existsSync(OPENHUMAN_DIR);
  },

  async install(_opts: ConnectOptions): Promise<ConnectResult> {
    p.log.warn(
      "OpenHuman integration is not yet automated. No `integrations/openhuman/` folder exists in the agentmemory repo today.",
    );
    p.note(
      [
        "OpenHuman is a Memory-trait host. The expected wiring is the REST",
        "proxy at http://localhost:3111 plus an OpenHuman-side Memory trait",
        "impl. Once integrations/openhuman/ lands in agentmemory we'll wire",
        "this up automatically.",
        "",
        `Tracking: ${DOCS}`,
      ].join("\n"),
      "OpenHuman manual install",
    );
    return {
      kind: "stub",
      reason: "no-integration-folder-yet",
    };
  },
};

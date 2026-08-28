import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

export function defaultHermesHome(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  userHome = homedir(),
): string {
  if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"]?.trim();
    return join(localAppData || join(userHome, "AppData", "Local"), "hermes");
  }
  return join(userHome, ".hermes");
}

const HERMES_DIR = process.env["HERMES_HOME"] || defaultHermesHome();
const HERMES_CONFIG = join(HERMES_DIR, "config.yaml");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes";
const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function profileAgentIdFromHermesHome(hermesHome: string): string {
  const normalizedHome = normalize(hermesHome);
  const candidate = basename(normalizedHome);
  return basename(dirname(normalizedHome)) === "profiles" && PROFILE_ID_RE.test(candidate)
    ? candidate
    : "default";
}

export function renderHermesMcpConfig(hermesHome = HERMES_DIR): string {
  const agentId = profileAgentIdFromHermesHome(hermesHome);
  return [
    "mcp_servers:",
    "  agentmemory:",
    "    command: npx",
    '    args: ["-y", "@agentmemory/mcp"]',
    "    env:",
    `      AGENT_ID: ${JSON.stringify(agentId)}`,
    '      AGENTMEMORY_AGENT_SCOPE: "isolated"',
    "    tools:",
    "      include:",
    "        - memory_save",
    "        - memory_recall",
    "        - memory_smart_search",
    "        - memory_sessions",
    "",
    "memory:",
    "  provider: agentmemory",
  ].join("\n");
}

export const adapter: ConnectAdapter = {
  name: "hermes",
  displayName: "Hermes Agent",
  category: "native",
  docs: DOCS,
  protocolNote:
    "→ Using MCP. Hooks are also available — see https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes.",

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
        renderHermesMcpConfig(HERMES_DIR),
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

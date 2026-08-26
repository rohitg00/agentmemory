export type ConnectOptions = {
  dryRun: boolean;
  force: boolean;
  /**
   * When true, adapters that ship a native hook config alongside MCP
   * additionally write it: Codex (`~/.codex/hooks.json`, workaround for
   * openai/codex#16430), Claude Code (`~/.claude/settings.json`, workaround
   * for #508), Droid (`~/.factory/hooks.json`, its native hooks config),
   * and DeepSeek Harness (`$DSH_HOME/agentmemory.hooks.json` plus a
   * hooks-claude-code patch row). No-op for adapters without a hooks
   * installer.
   */
  withHooks?: boolean;
  /**
   * When true (default), after wiring the agent's MCP/hooks, also write a
   * memory-usage guideline into the agent's native rules file so hook-less
   * agents proactively call memory_recall / memory_save. Disabled with
   * `--no-guidelines`. No-op for agents without a guideline target.
   */
  guidelines?: boolean;
};

export type ConnectAdapter = {
  name: string;
  displayName: string;
  docs?: string;
  /**
   * One-line explanation of which protocol this adapter wires (REST hooks vs
   * MCP) and why. Printed above the install summary so users see — before
   * any config mutation — that REST is the primary surface and MCP is the
   * opt-in bridge for MCP-only clients.
   */
  protocolNote?: string;
  /**
   * Integration style, used by onboarding to group agents. "native" =
   * ships a first-party plugin / lifecycle hooks; "mcp" = wires the MCP
   * server only. Declared on the adapter so the picker never needs a
   * separate hardcoded list (#872). Defaults to "mcp" when omitted.
   */
  category?: "native" | "mcp";
  detect(): boolean;
  install(opts: ConnectOptions): Promise<ConnectResult>;
};

export type ConnectResult =
  | { kind: "installed"; mutatedPath?: string; backupPath?: string }
  | { kind: "already-wired"; mutatedPath?: string }
  | { kind: "stub"; reason: string }
  | { kind: "skipped"; reason: string };

export type ConnectOptions = {
  dryRun: boolean;
  force: boolean;
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
  detect(): boolean;
  install(opts: ConnectOptions): Promise<ConnectResult>;
};

export type ConnectResult =
  | { kind: "installed"; mutatedPath?: string; backupPath?: string }
  | { kind: "already-wired"; mutatedPath?: string }
  | { kind: "stub"; reason: string }
  | { kind: "skipped"; reason: string };

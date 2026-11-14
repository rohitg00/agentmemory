interface ObsidianImportCommandOptions {
  base: string;
  args: string[];
  secret?: string;
  log?: (line: string) => void;
}

const GLOBAL_VALUES = new Set(["--port", "--instance", "--data-dir", "--tools"]);

export async function runObsidianImportCommand(options: ObsidianImportCommandOptions): Promise<number> {
  const log = options.log ?? console.log;
  const output = (value: unknown): void => log(JSON.stringify(value, null, 2));
  let vaultDir: string | undefined;
  let prefer: "vault" | "store" = "vault";
  let dryRun = false;
  const seen = new Set<string>();
  try {
    for (let i = 0; i < options.args.length; i++) {
      const arg = options.args[i];
      if (arg === "--json" || arg === "--verbose" || arg === "-v") continue;
      const equals = arg.indexOf("=");
      const flag = equals > 0 ? arg.slice(0, equals) : arg;
      if (flag === "--dry-run" && equals < 0) {
        if (seen.has(flag)) throw new Error("Duplicate --dry-run");
        seen.add(flag); dryRun = true; continue;
      }
      if (flag !== "--vault-dir" && flag !== "--prefer" && !GLOBAL_VALUES.has(flag)) {
        throw new Error(`Unknown obsidian-import argument: ${flag}`);
      }
      const value = equals > 0 ? arg.slice(equals + 1) : options.args[++i];
      if (!value?.trim() || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      if (seen.has(flag)) throw new Error(`Duplicate ${flag}`);
      seen.add(flag);
      if (flag === "--vault-dir") vaultDir = value;
      else if (flag === "--prefer") {
        if (value !== "vault" && value !== "store") throw new Error("--prefer must be vault or store");
        prefer = value;
      }
    }
    if (!vaultDir) throw new Error("--vault-dir is required");
  } catch (error) {
    output({ success: false, error: error instanceof Error ? error.message : "Invalid arguments" });
    return 2;
  }
  try {
    const response = await fetch(`${options.base}/agentmemory/obsidian/import`, {
      method: "POST",
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        ...(options.secret ? { Authorization: `Bearer ${options.secret}` } : {}),
      },
      body: JSON.stringify({ vaultDir, dryRun, prefer }),
      signal: AbortSignal.timeout(60_000),
    });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid import response");
    output({ ...value, ...(!response.ok ? { httpStatus: response.status } : {}) });
    return response.ok && (value as { success?: unknown }).success === true ? 0 : 1;
  } catch {
    output({ success: false, error: "Import request failed; a lost response may have followed a write. Inspect the store before retrying." });
    return 1;
  }
}

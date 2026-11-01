interface GraphIndexCommandOptions {
  base: string;
  args: string[];
  secret?: string;
  log?: (line: string) => void;
}

const VALUE_FLAGS = new Set(["--port", "--instance", "--data-dir", "--tools"]);

export async function runGraphIndexCommand(options: GraphIndexCommandOptions): Promise<number> {
  const log = options.log ?? console.log;
  const json = options.args.includes("--json");
  const output = (value: Record<string, unknown>): void => {
    if (json) { log(JSON.stringify(value, null, 2)); return; }
    if (value.error) { log(String(value.error)); return; }
    log(`Graph index: ${value.state ?? "unknown"}`);
    if (value.jobId) log(`Job: ${value.jobId}, processed ${value.processed ?? 0} of ${value.total ?? "unknown"}`);
    if (value.action) log(String(value.action));
  };
  let command: string | undefined;
  let allowLegacyScan = false;
  try {
    for (let i = 0; i < options.args.length; i++) {
      const arg = options.args[i]!;
      if (arg === "--json") continue;
      if (arg === "--allow-legacy-scan") { allowLegacyScan = true; continue; }
      if (VALUE_FLAGS.has(arg)) {
        if (!options.args[++i] || options.args[i]!.startsWith("--")) throw new Error(`Missing value for ${arg}`);
        continue;
      }
      if ([...VALUE_FLAGS].some((flag) => arg.startsWith(`${flag}=`) && arg.length > flag.length + 1)) continue;
      if (arg === "--verbose" || arg === "-v") continue;
      if (!command && ["status", "migrate", "resume"].includes(arg)) { command = arg; continue; }
      throw new Error(`Unknown graph-index argument: ${arg}`);
    }
    command ??= "status";
    if (command === "status" && allowLegacyScan) throw new Error("status does not accept --allow-legacy-scan");
    if (command === "migrate" && !allowLegacyScan) {
      throw new Error("Migration requires --allow-legacy-scan. Initial discovery reads each complete legacy graph scope and can use substantial memory; run it during maintenance.");
    }
  } catch (error) {
    output({ error: error instanceof Error ? error.message : String(error) });
    return 2;
  }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.secret) headers.Authorization = `Bearer ${options.secret}`;
    if (command !== "status") headers["Content-Type"] = "application/json";
    const response = await fetch(`${options.base}/agentmemory/graph/index${command === "status" ? "" : `/${command}`}`, {
      method: command === "status" ? "GET" : "POST",
      headers,
      ...(command === "status" ? {} : { body: JSON.stringify({ allowLegacyScan }) }),
      signal: AbortSignal.timeout(10_000),
    });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Server returned an invalid graph-index response");
    output({ ...(value as Record<string, unknown>), ...(!response.ok ? { httpStatus: response.status } : {}) });
    return response.ok ? 0 : 1;
  } catch (error) {
    output({ error: error instanceof Error ? error.message : String(error) });
    return 1;
  }
}

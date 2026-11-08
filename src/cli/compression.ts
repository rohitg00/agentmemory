import { parseCompressionScope } from "../functions/compression-recovery.js";

export async function runCompressionCommand(options: {
  base: string; args: string[]; secret?: string; log?: (line: string) => void;
}): Promise<number> {
  const log = options.log ?? console.log;
  const json = options.args.includes("--json");
  try {
    const input: Record<string, unknown> = {};
    let retry = false;
    let dryRun = false;
    const valueFlags: Record<string, string> = { "--session": "sessionId", "--project": "project", "--agent-id": "agentId", "--limit": "limit", "--cursor": "cursor" };
    for (let i = 0; i < options.args.length; i++) {
      const flag = options.args[i];
      if (flag === "--json") continue;
      if (flag === "--retry") { retry = true; continue; }
      if (flag === "--dry-run") { dryRun = true; continue; }
      if (flag.startsWith("--port=") || flag.startsWith("--instance=")) {
        if (!flag.slice(flag.indexOf("=") + 1)) throw new Error(`Missing value for ${flag.split("=")[0]}`);
        continue;
      }
      if (flag === "--port" || flag === "--instance") {
        if (!options.args[++i] || options.args[i].startsWith("--")) throw new Error(`Missing value for ${flag}`);
        continue;
      }
      const name = valueFlags[flag];
      if (!name) throw new Error(`Unknown compression option: ${flag}`);
      if (input[name] !== undefined) throw new Error(`Duplicate option: ${flag}`);
      const value = options.args[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      input[name] = value;
    }
    if (retry && dryRun) throw new Error("Use either --retry or --dry-run");
    const scope = parseCompressionScope(input);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.secret) headers.Authorization = `Bearer ${options.secret}`;
    const query = new URLSearchParams(Object.entries(scope).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const response = await fetch(`${options.base}/agentmemory/compression${retry ? "/retry" : `?${query}`}`, {
      method: retry ? "POST" : "GET", headers, ...(retry ? { body: JSON.stringify(scope) } : {}),
      signal: AbortSignal.timeout(retry ? 120_000 : 10_000),
    });
    if (!response.ok) throw new Error(`Compression endpoint returned HTTP ${response.status}`);
    const result = await response.json() as { success?: boolean; error?: string; dryRun?: boolean; items?: Array<{ observationId: string; sessionId: string; status: string; retryable: boolean; error?: string; outcome?: string }>; attempted?: number; recovered?: number; failed?: number; nextCursor?: string };
    if (typeof result.success !== "boolean" || !Array.isArray(result.items)) throw new Error("Invalid compression response");
    if (json) log(JSON.stringify(result, null, 2));
    else {
      log(retry ? `Compression: ${result.recovered ?? 0} recovered, ${result.failed ?? 0} failed, ${result.attempted ?? 0} attempted` : `Compression: ${result.items.length} pending or failed observations (inspection only)`);
      if (result.error === "cursor_stale") log("Compression cursor changed. Restart without --cursor.");
      for (const item of result.items) log(`${item.sessionId}/${item.observationId}: ${item.outcome ?? item.status}${item.error ? ` (${item.error})` : ""}${item.error === "source_unavailable" ? " [source unavailable]" : ""}`);
      if (result.nextCursor) log(`Continue with --cursor ${result.nextCursor}`);
      if (!retry && result.items.some((item) => item.retryable)) log("Use --retry to send retained, privacy-filtered source to the configured model. Model usage may incur costs.");
    }
    return result.success ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compression request failed";
    log(json ? JSON.stringify({ success: false, error: message }) : `Compression: ${message}`);
    return 1;
  }
}

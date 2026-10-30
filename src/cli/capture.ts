import { drainSpool, parseSentMark, retainSent, spoolSummary, type SendOutcome, type SpoolRecord } from "../capture/spool.js";
import { CURL_AUTH_HEADER } from "../functions/status.js";

interface CaptureCommandOptions {
  base: string;
  args: string[];
  secret?: string;
  log?: (line: string) => void;
}

function headers(secret?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) h["Authorization"] = `Bearer ${secret}`;
  return h;
}

function classify(status: number): SendOutcome {
  if (status === 200) return "duplicate";
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "rejected";
}

async function serverCapture(base: string, secret?: string): Promise<unknown> {
  try {
    const res = await fetch(`${base}/agentmemory/capture?limit=20`, {
      headers: headers(secret),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runCaptureCommand(options: CaptureCommandOptions): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  const json = options.args.includes("--json");
  const drain = options.args.includes("--drain");
  const output: Record<string, unknown> = {};

  if (drain) {
    output["drain"] = await drainSpool(options.base, async (record: SpoolRecord) => {
      const res = await fetch(`${options.base}/agentmemory/observe`, {
        method: "POST",
        headers: headers(options.secret),
        body: JSON.stringify({ ...record.body, eventId: record.eventId }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => "");
      const outcome = classify(res.status);
      if (outcome === "delivered" || outcome === "duplicate") {
        let mark = null;
        try {
          mark = parseSentMark(JSON.parse(text));
        } catch {}
        if (mark) retainSent(options.base, record.eventId, record.body, mark);
      }
      return outcome;
    });
  }
  output["spool"] = spoolSummary(options.base);
  output["server"] = await serverCapture(options.base, options.secret);

  if (json) {
    log(JSON.stringify(output, null, 2));
    return 0;
  }

  const spool = output["spool"] as ReturnType<typeof spoolSummary>;
  if (drain) {
    const d = output["drain"] as Awaited<ReturnType<typeof drainSpool>>;
    log(
      d.skipped
        ? `Drain skipped: ${d.skipped === "locked" ? "another drain is running" : "nothing to send"}`
        : `Drained ${d.claimed}: ${d.delivered} stored, ${d.duplicates} already stored, ${d.rejected} rejected, ${d.expired} expired, ${d.remaining} still waiting${d.error ? ` (${d.error})` : ""}`,
    );
  }
  log(`Local spool: ${spool.enabled ? `${spool.records} waiting, ${spool.bytes} bytes` : "off (AGENTMEMORY_CAPTURE_SPOOL=false)"}`);
  log(`  file: ${spool.path}`);
  log(`  limits: ${spool.maxBytes} bytes, ${spool.maxAgeHours} h`);
  log(`  totals: ${spool.stats.spooled} spooled, ${spool.stats.delivered} delivered, ${spool.stats.duplicates} duplicates, ${spool.stats.dropped} dropped, ${spool.stats.expired} expired`);
  if (spool.stats.lastDrainAt) log(`  last drain: ${spool.stats.lastDrainAt}`);
  if (spool.stats.lastDropAt) log(`  last drop: ${spool.stats.lastDropAt} (${spool.stats.lastDropReason ?? "unknown"})`);

  const server = output["server"] as {
    error?: string;
    capture?: { inbox?: { pending: number; retrying: number; dead: number; lastError: string | null } | null; sinceStart?: Record<string, number> } | null;
    items?: Array<{ eventId: string; status: string; attempts: number; lastError?: string; preview?: string }>;
  };
  if (server.error) {
    log(`Server: unreachable at ${options.base} (${server.error})`);
    return 0;
  }
  const inbox = server.capture?.inbox;
  log(`Server inbox: ${inbox ? `${inbox.pending} pending, ${inbox.retrying} retrying, ${inbox.dead} dead letters` : "unknown"}`);
  if (inbox?.lastError) log(`  last error: ${inbox.lastError}`);
  for (const item of server.items ?? []) {
    log(`  ${item.status.padEnd(8)} ${item.eventId} attempts=${item.attempts} ${item.preview ?? ""}`);
  }
  if (inbox && inbox.dead > 0) {
    log(`Retry dead letters: curl -X POST ${options.base}/agentmemory/capture/retry ${CURL_AUTH_HEADER} -H "Content-Type: application/json" -d '{"all":true}'`);
  }
  return 0;
}

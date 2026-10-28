import { appendSpool, drainSpool, parseSentMark, reconcileSent, retainSent, spoolSummary, type SendOutcome, type SpoolRecord } from "./spool.js";
import { scrubRecord, stripPrivateData } from "../functions/privacy.js";

export function cleanCapture(value: unknown): unknown {
  if (typeof value === "string") {
    try { return JSON.stringify(cleanCapture(JSON.parse(value))); } catch { return stripPrivateData(value); }
  }
  if (Array.isArray(value)) return value.map(cleanCapture);
  if (value && typeof value === "object") return scrubRecord(Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /(?:password|passwd|secret|token|credential|authorization|apikey|secretkey|privatekey|accesskey)$/i.test(key.replace(/[_-]/g, "")) ? "[REDACTED_SECRET]" : cleanCapture(item),
  ])), { scrubKeys: true });
  return value;
}

type Response = { status: number; body: unknown };
export function createCapture(url: string, post: (body: Record<string, unknown>) => Promise<Response>) {
  const pending = new Set<Promise<unknown>>();
  let draining: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let error: string | undefined;

  async function send(record: Pick<SpoolRecord, "eventId" | "body">): Promise<SendOutcome> {
    const result = await post(record.body);
    if (result.status >= 200 && result.status < 300) {
      const mark = parseSentMark(result.body);
      if (mark) {
        reconcileSent(url, mark.bootId);
        retainSent(url, record.eventId, record.body, mark);
      }
      return (result.body as { status?: string })?.status === "duplicate" ? "duplicate" : "delivered";
    }
    return result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500 ? "retry" : "rejected";
  }
  function track(work: Promise<unknown>) {
    const safe = work.catch(() => { error = "Capture spool is unavailable; check disk space and permissions."; });
    pending.add(safe);
    void safe.finally(() => pending.delete(safe));
    return safe;
  }
  function replay() {
    if (stopped || draining) return draining;
    draining = track(drainSpool(url, send, { maxRecords: 100, deadlineMs: 600 })).finally(() => { draining = undefined; });
    return draining;
  }
  return {
    enqueue(body: Record<string, unknown> & { eventId: string }) {
      track((async () => {
        const outcome = await send({ eventId: body.eventId, body });
        if (outcome === "retry") {
          const result = appendSpool(url, body.eventId, body, "client-delivery-failed");
          if (!result.spooled) error = "Capture could not be queued; check /agentmemory-status.";
        } else if (outcome === "rejected") error = "Capture was rejected; check the daemon URL and credentials.";
      })());
    },
    start() {
      stopped = false;
      if (!timer) { timer = setInterval(replay, 10_000); timer.unref(); }
      void replay();
    },
    replay,
    async flush() { await Promise.allSettled([...pending]); await replay(); },
    stop() { stopped = true; clearInterval(timer); timer = undefined; },
    status() { return { ...spoolSummary(url), error }; },
  };
}

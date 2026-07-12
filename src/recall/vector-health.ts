import type { RetrievalChannelStatus } from "../types.js";

type VectorFailureKind = "rate_limited" | "authentication" | "timeout" | "index_unavailable" | "invalid_request" | "provider_error";

function classify(error: unknown): VectorFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b429\b|quota|rate.?limit/i.test(message)) return "rate_limited";
  if (/\b401\b|\b403\b|auth|api.?key|invalid model/i.test(message)) return "authentication";
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/dimension|index unavailable|index missing/i.test(message)) return "index_unavailable";
  if (/\b400\b|invalid request/i.test(message)) return "invalid_request";
  return "provider_error";
}

export class VectorRetrievalHealth {
  private state: "closed" | "open" | "half_open" | "latched_disabled" = "closed";
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private reason?: string;

  constructor(
    private readonly failureThreshold = 3,
    private readonly recoveryMs = 30_000,
  ) {}

  begin(configured: boolean, indexAvailable: boolean): RetrievalChannelStatus {
    if (!configured) return { status: "disabled", attempted: false, reason: "embedding provider is not configured" };
    if (!indexAvailable) return { status: "degraded", attempted: false, reason: "vector index is unavailable", fallback: "BM25/graph" };
    if (this.state === "latched_disabled") {
      return { status: "disabled", attempted: false, reason: this.reason || "embedding configuration is invalid", fallback: "BM25/graph" };
    }
    if (this.state === "open") {
      if (Date.now() - this.openedAt < this.recoveryMs) {
        return { status: "degraded", attempted: false, reason: this.reason || "vector circuit is open", fallback: "BM25/graph" };
      }
      if (this.probeInFlight) {
        return { status: "degraded", attempted: false, reason: "vector half-open probe is in flight", fallback: "BM25/graph" };
      }
      this.state = "half_open";
    }
    if (this.state === "half_open") {
      if (this.probeInFlight) {
        return { status: "degraded", attempted: false, reason: "vector half-open probe is in flight", fallback: "BM25/graph" };
      }
      this.probeInFlight = true;
    }
    return { status: "healthy", attempted: true };
  }

  success(): void {
    this.state = "closed";
    this.failures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
    this.reason = undefined;
  }

  failure(error: unknown): RetrievalChannelStatus {
    const kind = classify(error);
    this.probeInFlight = false;
    this.reason = `embedding ${kind.replace(/_/g, " ")}`;
    if (kind === "authentication") {
      this.state = "latched_disabled";
      return { status: "disabled", attempted: true, reason: this.reason, fallback: "BM25/graph" };
    }
    if (kind === "invalid_request") {
      return { status: "degraded", attempted: true, reason: this.reason, fallback: "BM25/graph" };
    }
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
    return { status: "degraded", attempted: true, reason: this.reason, fallback: "BM25/graph" };
  }
}

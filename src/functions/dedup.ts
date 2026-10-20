import { createHash } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60_000;

let skippedSinceStart = 0;

export function recordDedupSkip(): void {
  skippedSinceStart++;
}

export function getDedupSkippedCount(): number {
  return skippedSinceStart;
}

export const DEDUP_WINDOW_MS = TTL_MS;

function outputDigest(toolOutput: unknown): string {
  if (toolOutput === undefined) return "";
  const text = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput) ?? "";
  return createHash("sha256").update(text).digest("hex");
}

interface DedupEntry {
  hash: string;
  expiresAt: number;
}

export class DedupMap {
  private entries = new Map<string, DedupEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  computeHash(sessionId: string, toolName: string, toolInput: unknown, toolOutput?: unknown): string {
    const input =
      typeof toolInput === "string"
        ? toolInput.slice(0, 500)
        : JSON.stringify(toolInput ?? "").slice(0, 500);
    const output = outputDigest(toolOutput);
    const raw = output ? `${sessionId}:${toolName}:${input}:${output}` : `${sessionId}:${toolName}:${input}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  isDuplicate(hash: string): boolean {
    const entry = this.entries.get(hash);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(hash);
      return false;
    }
    return true;
  }

  record(hash: string): void {
    this.entries.set(hash, { hash, expiresAt: Date.now() + TTL_MS });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) this.entries.delete(key);
    }
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  get size(): number {
    return this.entries.size;
  }
}

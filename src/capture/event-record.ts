import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

export const EVENT_SHARD_CHARS = 2;
export const EVENT_SHARDS = 16 ** EVENT_SHARD_CHARS;

export interface CompletedEvent {
  key: string;
  eventId: string;
  sessionId: string;
  project: string;
  observationId: string;
  acceptedAt: string;
  completedAt: string;
  attempts: number;
  state?: "deleted";
  deletedAt?: string;
}

export function captureEventShard(key: string): string {
  return key.slice(4, 4 + EVENT_SHARD_CHARS);
}

export function captureEventScope(key: string): string {
  return KV.captureEvents(captureEventShard(key));
}

export function isCaptureKey(value: unknown): value is string {
  return typeof value === "string" && /^cap_[0-9a-f]{40}$/.test(value);
}

export async function markCaptureEventDeleted(
  kv: StateKV,
  observation: { id: string; sessionId?: string; captureKey?: unknown } | null | undefined,
): Promise<void> {
  const key = observation?.captureKey;
  if (!observation || !isCaptureKey(key)) return;
  const scope = captureEventScope(key);
  const existing = await kv.get<CompletedEvent>(scope, key);
  if (existing?.state === "deleted") return;
  const now = new Date().toISOString();
  const marker: CompletedEvent = {
    key,
    eventId: existing?.eventId ?? "",
    sessionId: existing?.sessionId ?? observation.sessionId ?? "",
    project: existing?.project ?? "",
    observationId: existing?.observationId || observation.id,
    acceptedAt: existing?.acceptedAt ?? now,
    completedAt: existing?.completedAt ?? now,
    attempts: existing?.attempts ?? 0,
    state: "deleted",
    deletedAt: now,
  };
  await kv.set(scope, key, marker);
}

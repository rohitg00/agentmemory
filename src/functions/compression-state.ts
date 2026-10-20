import { randomUUID } from "node:crypto";
import type { CompressedObservation, ObservationCompression, RawObservation } from "../types.js";
import { stableStringify } from "../capture/event-id.js";
import { fingerprintId, KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { rawFromObservationSource } from "./observation-source.js";
import { scrubRecord } from "./privacy.js";

export type StoredObservation = (RawObservation & { compression?: ObservationCompression }) | CompressedObservation;

export function pendingCompression(attempts = 0): ObservationCompression {
  return { status: "pending", revision: randomUUID(), attempts };
}

export function observationRevision(observation: StoredObservation): string {
  return fingerprintId("compression", stableStringify(observation));
}

export function needsCompression(observation: StoredObservation): boolean {
  return "title" in observation
    ? observation.compression?.status === "pending" || observation.compression?.status === "failed"
    : typeof observation.hookType === "string" && Boolean(observation.hookType);
}

export function compressionRaw(observation: StoredObservation): RawObservation | null {
  const raw = "title" in observation ? rawFromObservationSource(observation) : observation;
  if (!raw || !raw.id || !raw.sessionId || !raw.timestamp || !raw.hookType) return null;
  const values = [raw.toolInput, raw.toolOutput, raw.userPrompt, raw.assistantResponse, raw.raw, raw.imageData];
  const retained = values.some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
  return retained ? scrubRecord({ ...raw, captureKey: observation.captureKey }) : null;
}

export async function markCompressionDispatchFailed(
  kv: StateKV,
  observation: CompressedObservation,
): Promise<void> {
  await withKeyedLock(`obs:${observation.sessionId}`, async () => {
    const current = await kv.get<CompressedObservation>(KV.observations(observation.sessionId), observation.id);
    if (!current?.compression || current.compression.revision !== observation.compression?.revision) return;
    if (current.compression.status !== "pending" || current.compression.attempts !== 0) return;
    await kv.set(KV.observations(current.sessionId), current.id, {
      ...current,
      compression: { ...current.compression, status: "failed", error: "dispatch_failed" },
    });
  });
}

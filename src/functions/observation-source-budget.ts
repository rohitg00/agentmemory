import type { CompressedObservation } from "../types.js";
import { checkPayloadFrameSize, payloadByteLength, SAFE_PAYLOAD_BYTES, type OversizedPayload } from "../state/frame-guard.js";
import { normalizeObservationSource, OBSERVATION_SOURCE_MAX_BYTES, withoutObservationSource } from "./observation-source.js";

export const SESSION_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

export function budgetLiveObservationSource(
  observation: CompressedObservation,
  existing: CompressedObservation[],
): CompressedObservation {
  const planned = budgetImportedObservationSources([observation], existing);
  return planned.success ? planned.observations[0]! : withoutObservationSource(observation);
}

export function budgetImportedObservationSources(
  incoming: CompressedObservation[],
  existing: CompressedObservation[] = [],
  strategy: "merge" | "replace" | "skip" = "merge",
): { success: true; observations: CompressedObservation[]; sourceTruncated: number; sourceOmitted: number } | OversizedPayload {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const rows = incoming.map((row) => ({ ...row, source: normalizeObservationSource(row.source) }));
  const written = rows.filter((row) => strategy !== "skip" || !existingById.has(row.id));
  const replacedIds = new Set(written.map((row) => row.id));
  const kept = strategy === "replace" ? [] : existing.filter((row) => !replacedIds.has(row.id));
  const base = [...kept, ...written.map(withoutObservationSource)];
  const envelope = { message_type: "invocation_result", invocation_id: "00000000-0000-0000-0000-000000000000", result: base };
  const oversized = checkPayloadFrameSize(envelope, "observation summaries already exceed one session response; split the import into smaller sessions");
  if (oversized) return oversized;

  const existingSourceBytes = kept.reduce((sum, row) => sum + (row.source ? payloadByteLength(row.source) + 10 : 0), 0);
  const sourceRows = written.filter((row) => row.source !== undefined);
  const available = Math.max(0, Math.min(
    SESSION_SOURCE_MAX_BYTES - existingSourceBytes,
    SAFE_PAYLOAD_BYTES - payloadByteLength(envelope) - 64 * 1024,
  ));
  const incomingSourceBytes = sourceRows.reduce((sum, row) => sum + payloadByteLength(row.source) + 10, 0);
  const perSource = incomingSourceBytes <= available
    ? OBSERVATION_SOURCE_MAX_BYTES
    : Math.min(OBSERVATION_SOURCE_MAX_BYTES, Math.floor(available / Math.max(1, sourceRows.length)) - 10);
  let sourceTruncated = 0;
  let sourceOmitted = 0;
  for (const row of sourceRows) {
    const source = row.source!;
    const metadata = { hookType: source.hookType, originalBytes: source.originalBytes, truncated: true };
    if (payloadByteLength(metadata) > perSource) {
      delete row.source;
      sourceOmitted++;
      continue;
    }
    row.source = normalizeObservationSource(source, perSource);
    if (row.source?.truncated) sourceTruncated++;
  }
  return { success: true, observations: rows, sourceTruncated, sourceOmitted };
}

import { TriggerAction, type IIIClient } from "iii-sdk";
import { readFileSync } from "node:fs";
import { isManagedImagePath } from "../utils/image-store.js";
import type { RawObservation, CompressedObservation, MemoryProvider, ObservationCompression, Session } from "../types.js";
import { KV, STREAM } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { COMPRESSION_SYSTEM, buildCompressionPrompt } from "../prompts/compression.js";
import { VISION_DESCRIPTION_PROMPT } from "../prompts/vision.js";
import { parseCompressionXml } from "../prompts/compression-output.js";
import { getSearchIndex, getVectorIndex, scheduleIndexSave, vectorIndexAddGuarded } from "./search.js";
import { CompressOutputSchema } from "../eval/schemas.js";
import { validateOutput } from "../eval/validator.js";
import { scoreCompression } from "../eval/quality.js";
import { compressWithRetry } from "../eval/self-correct.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import { logger } from "../logger.js";
import { withoutObservationSource } from "./observation-source.js";
import { budgetLiveObservationSource } from "./observation-source-budget.js";
import { buildSyntheticCompression } from "./compress-synthetic.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { scrubRecord, stripPrivateData } from "./privacy.js";
import { compressionRaw, needsCompression, observationRevision, pendingCompression, type StoredObservation } from "./compression-state.js";
import { registerCompressionRecovery } from "./compression-recovery.js";

export const COMPRESSION_TIMEOUT_MS = 60_000;

type CompressRequest = { observationId: string; sessionId: string; raw?: RawObservation; expectedRevision?: string; scope?: { project?: string; agentId?: string } };
export type CompressResult = {
  success: boolean;
  error?: string;
  skipped?: boolean;
  retryable?: boolean;
  compressed?: Omit<CompressedObservation, "source">;
  qualityScore?: number;
  sourceTruncated?: boolean;
};
type CompressionAttempt = { revisions: Set<string>; resultRevision?: string };
type ActiveCompression = { promise: Promise<CompressResult>; attempt: CompressionAttempt };
const activeByStore = new WeakMap<StateKV, Map<string, ActiveCompression>>();

export function compressionInFlight(kv: StateKV, sessionId: string, observationId: string): boolean {
  return activeByStore.get(kv)?.has(JSON.stringify([sessionId, observationId])) ?? false;
}

function indexObservation(observation: CompressedObservation): void {
  getSearchIndex().add(observation);
  scheduleIndexSave();
}

export function registerCompressFunction(
  sdk: IIIClient,
  kv: StateKV,
  provider: MemoryProvider,
  metricsStore?: MetricsStore,
): void {
  const active = activeByStore.get(kv) ?? new Map<string, ActiveCompression>();
  activeByStore.set(kv, active);

  async function matchesScope(data: CompressRequest, row: StoredObservation): Promise<boolean> {
    if (!data.scope) return true;
    const session = await kv.get<Session>(KV.sessions, data.sessionId);
    return Boolean(session && (!data.scope.project || session.project === data.scope.project) &&
      (!data.scope.agentId || (row.agentId ?? session.agentId) === data.scope.agentId));
  }

  async function compress(data: CompressRequest, attempt: CompressionAttempt, deadline: number): Promise<CompressResult> {
    const { sessionId, observationId } = data;
    const startMs = Date.now();
    async function bounded<T>(work: () => Promise<T>): Promise<T> {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("compression_timeout");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([work(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("compression_timeout")), remaining);
        })]);
      } finally { clearTimeout(timer); }
    }
    const prepared = await withKeyedLock(`obs:${sessionId}`, async () => {
      const stored = await kv.get<StoredObservation>(KV.observations(sessionId), observationId);
      if (!stored || typeof stored !== "object" || stored.id !== observationId || stored.sessionId !== sessionId) return null;
      if (!await matchesScope(data, stored)) return { skipped: true as const };
      if (data.expectedRevision && observationRevision(stored) !== data.expectedRevision) return { skipped: true as const };
      if (!needsCompression(stored) && !data.raw) return { skipped: true as const };
      const rows = await kv.list<CompressedObservation>(KV.observations(sessionId));
      const fallback = "title" in stored ? stored : budgetLiveObservationSource(buildSyntheticCompression(scrubRecord(stored)), rows);
      const raw = compressionRaw(fallback);
      if (!raw && !("title" in stored)) return { unavailable: true as const };
      const compression: ObservationCompression = {
        ...pendingCompression((stored.compression?.attempts ?? 0) + (raw ? 1 : 0)),
        ...(raw ? { lastAttemptAt: new Date().toISOString() } : { status: "failed" as const, error: "source_unavailable" as const }),
      };
      const claimed = { ...stored, compression };
      await kv.set(KV.observations(sessionId), observationId, claimed);
      attempt.revisions.add(observationRevision(stored));
      attempt.revisions.add(observationRevision(claimed));
      if ("title" in claimed) indexObservation(claimed);
      return { raw, claimed, fallback, revision: observationRevision(claimed) };
    });
    if (!prepared) return { success: false, error: "observation_not_found", skipped: true, retryable: false };
    if ("skipped" in prepared) return { success: true, skipped: true };
    if ("unavailable" in prepared || !prepared.raw) return { success: false, error: "source_unavailable", retryable: false };
    const { raw, claimed, fallback, revision } = prepared;

    async function fail(error: NonNullable<ObservationCompression["error"]>): Promise<CompressResult> {
      const changed = await withKeyedLock(`obs:${sessionId}`, async () => {
        const current = await kv.get<StoredObservation>(KV.observations(sessionId), observationId);
        if (!current || observationRevision(current) !== revision) return true;
        const failed = { ...claimed, compression: { ...claimed.compression!, status: "failed" as const, error } };
        await kv.set(KV.observations(sessionId), observationId, failed);
        attempt.resultRevision = observationRevision(failed);
        attempt.revisions.add(attempt.resultRevision);
        return false;
      });
      await metricsStore?.record("mem::compress", Date.now() - startMs, false).catch(() => {});
      return changed
        ? { success: false, error: "observation_changed", skipped: true, retryable: false }
        : { success: false, error, retryable: true, ...(fallback.source?.truncated ? { sourceTruncated: true } : {}) };
    }

    try {
      let imageDescription: string | undefined;
      const hasImage = raw.modality === "image" || raw.modality === "mixed";

      if (hasImage && raw.imageData && provider.describeImage) {
        try {
          let base64Data = raw.imageData;
          let mimeType = "image/png";

          if (!raw.imageData.startsWith("/9j/") && !raw.imageData.startsWith("iVBOR")) {
            if (!isManagedImagePath(raw.imageData)) {
              throw new Error(`Refusing to read image outside managed store: ${raw.imageData}`);
            }
            const fileBuffer = readFileSync(raw.imageData);
            base64Data = fileBuffer.toString("base64");
            if (raw.imageData.endsWith(".jpg") || raw.imageData.endsWith(".jpeg")) mimeType = "image/jpeg";
            else if (raw.imageData.endsWith(".webp")) mimeType = "image/webp";
            else if (raw.imageData.endsWith(".gif")) mimeType = "image/gif";
          }

          imageDescription = await bounded(() => provider.describeImage!(base64Data, mimeType, VISION_DESCRIPTION_PROMPT));
          logger.info("Image described by vision model", { obsId: observationId });
        } catch {
          logger.warn("Vision model call failed, falling back to text-only compression", { obsId: observationId });
        }
      }

      const retainedOutput = raw.toolOutput ?? raw.assistantResponse ?? (raw.raw && Object.keys(Object(raw.raw)).length > 0 ? raw.raw : undefined);
      const prompt = buildCompressionPrompt({
        hookType: raw.hookType,
        toolName: raw.toolName,
        toolInput: raw.toolInput,
        toolOutput: imageDescription ? `[Image Description]: ${imageDescription}\n\n${retainedOutput ?? ""}` : retainedOutput,
        userPrompt: raw.userPrompt,
        timestamp: raw.timestamp,
      });
      const validator = (response: string) => {
        const parsed = parseCompressionXml(response);
        if (!parsed) return { valid: false as const, errors: ["xml_parse_failed"] };
        const result = validateOutput(CompressOutputSchema, scrubRecord(parsed), "mem::compress");
        return result.valid ? result : { valid: false as const, errors: result.result.errors };
      };
      const result = await compressWithRetry({
        ...provider,
        compress: (system, user) => bounded(() => provider.compress(system, user)),
      }, COMPRESSION_SYSTEM, prompt, validator, 1);
      if (!result.valid) {
        return fail(result.errors?.includes("xml_parse_failed") ? "parse_failed" : "validation_failed");
      }
      const qualityScore = scoreCompression(result.data);
      const candidate: CompressedObservation = {
        ...fallback,
        ...result.data,
        compressedAt: new Date().toISOString(),
        confidence: qualityScore / 100,
        compression: { ...claimed.compression, status: "complete" },
        ...(raw.imageData ? { imageRef: raw.imageData } : {}),
        ...(imageDescription ? { imageDescription: stripPrivateData(imageDescription) } : {}),
      };
      const compressed = await withKeyedLock(`obs:${sessionId}`, async () => {
        const current = await kv.get<StoredObservation>(KV.observations(sessionId), observationId);
        if (!current || observationRevision(current) !== revision || !await matchesScope(data, current)) return null;
        const rows = await kv.list<CompressedObservation>(KV.observations(sessionId));
        const bounded = budgetLiveObservationSource(candidate, rows);
        await kv.set(KV.observations(sessionId), observationId, bounded);
        attempt.resultRevision = observationRevision(bounded);
        attempt.revisions.add(attempt.resultRevision);
        indexObservation(bounded);
        return bounded;
      });
      if (!compressed) return { success: false, error: "observation_changed", skipped: true, retryable: false };
      const committedRevision = observationRevision(compressed);
      await bounded(() => vectorIndexAddGuarded(
        observationId, sessionId, compressed.title + " " + compressed.narrative,
        { kind: "observation", logId: observationId },
        (embedding, isCurrent) => withKeyedLock(`obs:${sessionId}`, async () => {
          const current = await kv.get<StoredObservation>(KV.observations(sessionId), observationId);
          if (!isCurrent() || !current || observationRevision(current) !== committedRevision) return false;
          getVectorIndex()?.add(observationId, sessionId, embedding);
          return true;
        }),
      )).catch(() => {});
      const published = await withKeyedLock(`obs:${sessionId}`, async () => {
        const current = await kv.get<StoredObservation>(KV.observations(sessionId), observationId);
        if (!current || observationRevision(current) !== committedRevision || !await matchesScope(data, current)) return false;
        await sdk.trigger({
          function_id: "stream::send",
          payload: {
            stream_name: STREAM.name, group_id: STREAM.viewerGroup,
            id: `compressed-${observationId}`, type: "compressed_observation",
            data: { type: "compressed", observation: withoutObservationSource(compressed), sessionId },
          },
          action: TriggerAction.Void(),
        }).catch(() => {});
        return true;
      });
      if (!published) return { success: false, error: "observation_changed", skipped: true, retryable: false };
      await metricsStore?.record("mem::compress", Date.now() - startMs, true, qualityScore).catch(() => {});
      return { success: true, compressed: withoutObservationSource(compressed), qualityScore, ...(compressed.source?.truncated ? { sourceTruncated: true } : {}) };
    } catch {
      logger.warn("Observation retained for compression retry", { observationId, sessionId });
      return fail("compression_failed");
    }
  }

  async function dispatch(data: CompressRequest, deadline: number): Promise<CompressResult> {
    const key = JSON.stringify([data.sessionId, data.observationId]);
    const existing = active.get(key);
    if (existing) {
      const changed: CompressResult = { success: false, error: "observation_changed", skipped: true, retryable: false };
      const requestedRevision = await withKeyedLock(`obs:${data.sessionId}`, async () => {
        const current = await kv.get<StoredObservation>(KV.observations(data.sessionId), data.observationId);
        if (!current || current.id !== data.observationId || current.sessionId !== data.sessionId || !await matchesScope(data, current)) return null;
        const revision = observationRevision(current);
        if (data.expectedRevision && data.expectedRevision !== revision && !existing.attempt.revisions.has(data.expectedRevision)) return null;
        return data.expectedRevision ?? revision;
      });
      if (!requestedRevision) return changed;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([existing.promise, new Promise<CompressResult>((resolve) => {
        timer = setTimeout(() => resolve({ success: false, error: "compression_timeout", retryable: true }), Math.max(0, deadline - Date.now()));
      })]).finally(() => clearTimeout(timer));
      if (result.error === "compression_timeout") return result;
      const shared = await withKeyedLock(`obs:${data.sessionId}`, async () => {
        const current = await kv.get<StoredObservation>(KV.observations(data.sessionId), data.observationId);
        if (!current || current.id !== data.observationId || current.sessionId !== data.sessionId || !await matchesScope(data, current)) return changed;
        const revision = observationRevision(current);
        if (revision === existing.attempt.resultRevision && existing.attempt.revisions.has(requestedRevision)) return result;
        return revision === requestedRevision && (needsCompression(current) || data.raw) ? null : changed;
      });
      return shared ?? dispatch({ ...data, expectedRevision: requestedRevision }, deadline);
    }
    if (Date.now() >= deadline) return { success: false, error: "compression_timeout", retryable: true };
    const attempt: CompressionAttempt = { revisions: new Set() };
    const task: ActiveCompression = { attempt, promise: compress(data, attempt, deadline).finally(() => {
      if (active.get(key) === task) active.delete(key);
    }) };
    active.set(key, task);
    return task.promise;
  }

  sdk.registerFunction("mem::compress", (data: CompressRequest): Promise<CompressResult> => {
    if (!data || typeof data.sessionId !== "string" || !data.sessionId.trim() ||
        typeof data.observationId !== "string" || !data.observationId.trim()) {
      return Promise.resolve({ success: false, error: "invalid_observation_identity", retryable: false });
    }
    if (data.raw !== undefined && (!data.raw || typeof data.raw.hookType !== "string" || !data.raw.hookType)) {
      return Promise.resolve({ success: false, error: "invalid_raw_observation" });
    }
    return dispatch(data, Date.now() + COMPRESSION_TIMEOUT_MS);
  });
  registerCompressionRecovery(sdk, kv);
}

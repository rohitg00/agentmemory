import type { IIIClient } from "iii-sdk";
import type { Session } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { fingerprintId, KV } from "../state/schema.js";
import { compressionInFlight, type CompressResult } from "./compress.js";
import { compressionRaw, needsCompression, observationRevision, type StoredObservation } from "./compression-state.js";
import { safeAudit } from "./audit.js";
import { checkPayloadFrameSize } from "../state/frame-guard.js";

export interface CompressionScope {
  sessionId?: string;
  project?: string;
  agentId?: string;
  limit: number;
  cursor?: string;
}

const MAX_CURSOR_LENGTH = 32 * 1024;
type Cursor = { sessionId: string; observationId: string; hashed: boolean };

export function parseCompressionScope(input: unknown): CompressionScope {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected an object");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["sessionId", "project", "agentId", "limit", "cursor"].includes(key))) {
    throw new Error("Unknown compression option");
  }
  const scope: CompressionScope = { limit: 10 };
  for (const key of ["sessionId", "project", "agentId", "cursor"] as const) {
    const value = data[key];
    if (value === undefined || (key === "cursor" && value === "")) continue;
    if (typeof value !== "string" || !value.trim() || value.length > (key === "cursor" ? MAX_CURSOR_LENGTH : 1024)) throw new Error(`Invalid ${key}`);
    scope[key] = value;
  }
  if (!scope.sessionId && !scope.project) throw new Error("Specify sessionId or project");
  if (data.limit !== undefined) {
    if ((typeof data.limit !== "number" && typeof data.limit !== "string") || !/^\d+$/.test(String(data.limit))) {
      throw new Error("limit must be an integer from 1 to 100");
    }
    scope.limit = Number(data.limit);
    if (!Number.isSafeInteger(scope.limit) || scope.limit < 1 || scope.limit > 100) throw new Error("limit must be an integer from 1 to 100");
  }
  readCursor(scope);
  return scope;
}

function scopeKey(scope: CompressionScope): string {
  return fingerprintId("compression-scope", JSON.stringify([scope.sessionId, scope.project, scope.agentId]));
}

function writeCursor(scope: CompressionScope, sessionId: string, observationId: string): string {
  const encode = (parts: unknown[]) => Buffer.from(JSON.stringify(parts)).toString("base64url");
  const cursor = encode([scopeKey(scope), sessionId, observationId]);
  return cursor.length <= MAX_CURSOR_LENGTH ? cursor : encode([
    scopeKey(scope), fingerprintId("session", sessionId), observationId ? fingerprintId("observation", observationId) : "", "hash",
  ]);
}

function readCursor(scope: CompressionScope): Cursor | null {
  if (!scope.cursor) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(scope.cursor, "base64url").toString("utf8"));
    if (!Array.isArray(value) || ![3, 4].includes(value.length) || value[0] !== scopeKey(scope) ||
        typeof value[1] !== "string" || typeof value[2] !== "string") throw new Error();
    const hashed = value.length === 4;
    if (hashed && (value[3] !== "hash" || !/^session_[a-f0-9]{16}$/.test(value[1]) ||
        (value[2] !== "" && !/^observation_[a-f0-9]{16}$/.test(value[2])))) throw new Error();
    return { sessionId: value[1], observationId: value[2], hashed };
  } catch { throw new Error("Invalid cursor for this compression scope"); }
}

export function registerCompressionRecovery(sdk: IIIClient, kv: StateKV): void {
  async function run(input: unknown, retry: boolean) {
    const request = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : input;
    if (request && typeof request === "object") delete (request as Record<string, unknown>)._caller_worker_id;
    const scope = parseCompressionScope(request);
    const after = readCursor(scope);
    const sessions = scope.sessionId
      ? [await kv.get<Session>(KV.sessions, scope.sessionId)].filter((s): s is Session => Boolean(s))
      : await kv.list<Session>(KV.sessions);
    const eligible = sessions.filter((s) => typeof s.id === "string" && (!scope.project || s.project === scope.project))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    let anchorRows: { sessionId: string; rows: StoredObservation[] } | undefined;
    if (after?.hashed) {
      const anchors = eligible.filter((session) => fingerprintId("session", session.id) === after.sessionId);
      let observationId: string | undefined = after.observationId ? undefined : "";
      if (anchors.length === 1 && after.observationId) {
        const rows = await kv.list<StoredObservation>(KV.observations(anchors[0].id));
        anchorRows = { sessionId: anchors[0].id, rows };
        const matches = rows.filter((row) => row && typeof row.id === "string" &&
          fingerprintId("observation", row.id) === after.observationId);
        if (matches.length === 1) observationId = matches[0].id;
      }
      if (anchors.length !== 1 || observationId === undefined) return {
        success: false, dryRun: !retry, error: "cursor_stale", items: [],
        attempted: 0, recovered: 0, failed: 0, scannedSessions: 0, scannedObservations: 0,
      };
      after.sessionId = anchors[0].id;
      after.observationId = observationId;
    }
    const items: Array<{ sessionId: string; observationId: string; status: string; attempts: number; retryable: boolean;
      truncated: boolean; inFlight: boolean; error?: string; outcome?: string }> = [];
    let scannedSessions = 0;
    let scannedObservations = 0;
    let attempted = 0;
    let recovered = 0;
    let failed = 0;
    let nextCursor: string | undefined;
    let stop = false;
    const startedAt = Date.now();
    for (const session of eligible) {
      if (after && session.id < after.sessionId) continue;
      if (scannedSessions >= 20) {
        nextCursor = writeCursor(scope, session.id, "");
        break;
      }
      scannedSessions++;
      const observations = anchorRows?.sessionId === session.id ? anchorRows.rows : await kv.list<StoredObservation>(KV.observations(session.id));
      const rows = observations.filter((row) => row && typeof row === "object" && typeof row.id === "string")
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      for (const row of rows) {
        if (after && session.id === after.sessionId && row.id <= after.observationId) continue;
        scannedObservations++;
        nextCursor = writeCursor(scope, session.id, row.id);
        if (row.sessionId === session.id && needsCompression(row) &&
            (!scope.agentId || (row.agentId ?? session.agentId) === scope.agentId)) {
          const source = compressionRaw(row);
          const metadata = row.compression;
          const item = {
            sessionId: session.id, observationId: row.id,
            status: metadata?.status ?? "raw",
            attempts: metadata?.attempts ?? 0,
            retryable: Boolean(source), truncated: "source" in row ? Boolean(row.source?.truncated) : false,
            inFlight: compressionInFlight(kv, session.id, row.id),
            error: (!source ? "source_unavailable" : metadata?.error) as string | undefined,
            outcome: undefined as string | undefined,
          };
          items.push(item);
          if (retry && source) {
            attempted++;
            let result: CompressResult;
            try {
              result = await sdk.trigger({ function_id: "mem::compress", payload: {
                sessionId: session.id, observationId: row.id, expectedRevision: observationRevision(row),
                scope: { project: scope.project, agentId: scope.agentId },
              } }) as CompressResult;
            } catch { result = { success: false, error: "compression_failed" }; }
            if (!result || typeof result.success !== "boolean") result = { success: false, error: "compression_failed" };
            item.truncated = result.sourceTruncated ?? item.truncated;
            item.retryable = result.retryable ?? item.retryable;
            if (result.success && !result.skipped) { recovered++; item.outcome = "recovered"; item.error = undefined; }
            else if (result.skipped) { item.outcome = "changed"; item.error = result.error; }
            else { failed++; item.outcome = "failed"; item.error = result.error ?? "compression_failed"; stop = true; }
          }
        }
        if (stop || items.length >= scope.limit || scannedObservations >= 1000 || Date.now() - startedAt >= 30_000) { stop = true; break; }
      }
      if (stop) break;
      nextCursor = undefined;
    }
    const result = { success: failed === 0, dryRun: !retry, items, attempted, recovered, failed, scannedSessions, scannedObservations,
      ...(nextCursor ? { nextCursor } : {}) };
    const oversized = checkPayloadFrameSize(result, "lower limit or select one session for compression recovery");
    if (retry && attempted > 0) {
      await safeAudit(kv, "compress", "mem::compression-retry", oversized ? [] : items.filter((i) => i.outcome === "recovered").map((i) => i.observationId), {
        sessionId: scope.sessionId, project: scope.project, agentId: scope.agentId, attempted, recovered, failed,
      });
    }
    return oversized ?? result;
  }
  sdk.registerFunction("mem::compression-status", (input: unknown) => run(input, false));
  sdk.registerFunction("mem::compression-retry", (input: unknown) => run(input, true));
}

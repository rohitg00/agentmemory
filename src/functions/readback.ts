import type { ISdk } from "iii-sdk";
import type {
  Memory,
  MemoryWriteCandidate,
  ReadbackResult,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";

type ReadbackMode = "search" | "smart-search";

interface ReadbackInput {
  candidateId?: string;
  memoryId?: string;
  queries?: unknown;
  limit?: number;
  mode?: ReadbackMode;
}

interface SearchLikeResult {
  results?: unknown[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function uniqueStrings(values: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = asString(value, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeLimit(value: unknown): number {
  if (!Number.isInteger(value)) return 10;
  return Math.max(1, Math.min(value as number, 50));
}

function normalizeMode(value: unknown): ReadbackMode {
  return value === "smart-search" ? "smart-search" : "search";
}

function normalizeQueries(queries: unknown): string[] {
  return uniqueStrings(queries, 10, 240);
}

function makeMemoryQueries(memory: Memory): string[] {
  const candidates = [
    `${memory.title} ${memory.content.slice(0, 160)}`,
    memory.concepts.join(" "),
    memory.files.join(" "),
    memory.title,
    memory.content.slice(0, 200),
  ];
  const queries = uniqueStrings(candidates, 5, 240);
  if (queries.length >= 2) return queries;
  if (memory.title && !queries.includes(memory.title)) queries.push(memory.title);
  const content = memory.content.slice(0, 120).trim();
  if (content && !queries.includes(content)) queries.push(content);
  return queries.slice(0, 5);
}

function makeCandidateQueries(candidate: MemoryWriteCandidate): string[] {
  const stored = normalizeQueries(candidate.readbackQueries);
  if (stored.length > 0) return stored;
  return uniqueStrings(
    [
      `${candidate.subject} ${candidate.predicate}`,
      `${candidate.subject} ${candidate.value}`,
      `${candidate.memoryType} ${candidate.value}`,
    ],
    5,
    240,
  );
}

function extractResultId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const direct = asString(record.id, 160) ?? asString(record.obsId, 160) ??
    asString(record.observationId, 160) ?? asString(record.memoryId, 160);
  if (direct) return direct;
  const observation = record.observation;
  if (observation && typeof observation === "object") {
    return asString((observation as Record<string, unknown>).id, 160) ?? null;
  }
  return null;
}

function topIdsFromResult(result: unknown, limit: number): string[] {
  const results = (result as SearchLikeResult | null)?.results;
  if (!Array.isArray(results)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    const id = extractResultId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function persistReadback(
  kv: StateKV,
  readback: ReadbackResult,
): Promise<ReadbackResult> {
  await kv.set(KV.readbackResults, readback.id, readback);
  await recordAudit(
    kv,
    "readback_verify",
    "mem::readback-verify",
    [readback.memoryId, readback.candidateId].filter(
      (id): id is string => typeof id === "string",
    ),
    {
      passed: readback.passed,
      queries: readback.queries.length,
      failureReason: readback.failureReason,
    },
  );
  return readback;
}

export function registerReadbackFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::readback-verify",
    async (data: ReadbackInput | undefined) => {
      const candidateId = asString(data?.candidateId, 160);
      const memoryId = asString(data?.memoryId, 160);
      const explicitQueries = normalizeQueries(data?.queries);
      const limit = normalizeLimit(data?.limit);
      const mode = normalizeMode(data?.mode);

      if (!candidateId && !memoryId) {
        return { success: false, error: "candidateId or memoryId is required" };
      }

      let targetMemoryId = memoryId;
      let queries = explicitQueries;
      let candidate: MemoryWriteCandidate | null = null;

      if (candidateId) {
        candidate = await kv.get<MemoryWriteCandidate>(
          KV.writeCandidates,
          candidateId,
        );
        if (!candidate) return { success: false, error: "candidate not found" };
        if (queries.length === 0) queries = makeCandidateQueries(candidate);
        targetMemoryId =
          targetMemoryId ??
          asString((candidate as MemoryWriteCandidate & { memoryId?: unknown }).memoryId, 160);
        if (!targetMemoryId) {
          const readback: ReadbackResult = {
            id: generateId("readback"),
            candidateId,
            createdAt: nowIso(),
            queries: queries.map((query) => ({ query, topIds: [], matched: false })),
            passed: false,
            failureReason: "candidate has no durable memoryId yet",
          };
          return {
            success: true,
            readback: await persistReadback(kv, readback),
          };
        }
      }

      const memory = await kv.get<Memory>(KV.memories, targetMemoryId!);
      if (!memory) return { success: false, error: "memory not found" };
      if (queries.length === 0) queries = makeMemoryQueries(memory);

      const queryResults = await Promise.all(
        queries.map(async (query) => {
          const searchResult = await sdk.trigger({
            function_id: mode === "smart-search" ? "mem::smart-search" : "mem::search",
            payload: { query, limit },
          });
          const topIds = topIdsFromResult(searchResult, limit);
          return {
            query,
            topIds,
            matched: topIds.includes(memory.id),
          };
        }),
      );

      const passed = queryResults.some((query) => query.matched);
      const readback: ReadbackResult = {
        id: generateId("readback"),
        ...(candidateId ? { candidateId } : {}),
        memoryId: memory.id,
        createdAt: nowIso(),
        queries: queryResults,
        passed,
        ...(passed ? {} : { failureReason: "target not found in top results" }),
      };
      return { success: true, readback: await persistReadback(kv, readback) };
    },
  );

  sdk.registerFunction(
    "mem::readback-list",
    async (data?: {
      candidateId?: string;
      memoryId?: string;
      limit?: number;
    }) => {
      const candidateId = asString(data?.candidateId, 160);
      const memoryId = asString(data?.memoryId, 160);
      const limit = normalizeLimit(data?.limit);
      let results = await kv.list<ReadbackResult>(KV.readbackResults);
      if (candidateId) {
        results = results.filter((result) => result.candidateId === candidateId);
      }
      if (memoryId) {
        results = results.filter((result) => result.memoryId === memoryId);
      }
      results.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return { success: true, readbacks: results.slice(0, limit) };
    },
  );
}

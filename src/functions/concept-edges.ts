import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { ConceptEdge, Memory, StateScope, StateScopeKey } from "../types.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";

const MIGRATION_KEY = "migrations:concept-edges-backfill" satisfies StateScopeKey;

/**
 * Same saturation curve as reinforceLesson (lessons.ts) so the
 * strength lifecycle profile stays consistent across surfaces:
 * asymptotic approach to 1.0, +10% of the remaining headroom per
 * co-occurrence.
 */
function reinforceConceptEdge(edge: ConceptEdge): void {
  edge.reinforcements++;
  edge.strength = Math.min(1.0, edge.strength + 0.1 * (1 - edge.strength));
  edge.lastSeenAt = new Date().toISOString();
}

/**
 * Concepts come from LLM compression output and from user-supplied
 * memory_save payloads, so casing and whitespace vary for the same
 * term. Normalize before pairing so "JWT" and "jwt" reinforce one
 * edge instead of fragmenting the graph.
 */
function normalizeConcepts(concepts: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of concepts) {
    if (typeof raw !== "string") continue;
    const concept = raw.trim().toLowerCase();
    if (concept.length === 0) continue;
    seen.add(concept);
  }
  return [...seen];
}

/** Canonical key for an unordered pair: lexicographic order, "|" separator. */
export function conceptEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Walk a memory's concepts[] and upsert one edge per unordered pair.
 * Existing edges reinforce; new edges start at strength 0.5 with the
 * same decayRate lessons use (0.05). Runs under a keyed lock because
 * the upsert is read-modify-write and derivation can fire from
 * mem::compress and mem::remember concurrently.
 */
export async function deriveConceptEdges(
  kv: StateKV,
  concepts: string[],
): Promise<number> {
  const normalized = normalizeConcepts(concepts);
  if (normalized.length < 2) return 0;
  normalized.sort();

  return withKeyedLock("mem:concept-edges", async () => {
    let touched = 0;
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        // normalized is sorted, so [i] < [j] is already canonical order
        const from = normalized[i];
        const to = normalized[j];
        const key = conceptEdgeKey(from, to);
        const existing = await kv.get<ConceptEdge>(KV.conceptEdges, key);
        if (existing) {
          reinforceConceptEdge(existing);
          await kv.set(KV.conceptEdges, key, existing);
        } else {
          const now = new Date().toISOString();
          const edge: ConceptEdge = {
            from,
            to,
            strength: 0.5,
            lastSeenAt: now,
            reinforcements: 0,
            createdAt: now,
            decayRate: 0.05,
          };
          await kv.set(KV.conceptEdges, key, edge);
        }
        touched++;
      }
    }
    return touched;
  });
}

export function registerConceptEdgesFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::concept-edges-derive",
    async (data: { concepts?: string[] }) => {
      if (!Array.isArray(data.concepts)) {
        return { success: false, error: "concepts must be an array" };
      }
      const edgesTouched = await deriveConceptEdges(kv, data.concepts);
      return { success: true, edgesTouched };
    },
  );

  sdk.registerFunction("mem::concept-edges-backfill",
    async () => {
      const migrated = await kv.get<StateScope[typeof MIGRATION_KEY]>(
        KV.state,
        MIGRATION_KEY,
      );
      if (migrated === true) {
        return { success: true, skipped: "already-migrated" };
      }

      // A non-empty scope means edges are already being derived live
      // (or a previous backfill ran before the flag existed) — re-running
      // would double-reinforce every pre-existing pair.
      const existingEdges = await kv.list<ConceptEdge>(KV.conceptEdges);
      if (existingEdges.length > 0) {
        await kv.set(KV.state, MIGRATION_KEY, true);
        return { success: true, skipped: "edges-already-present" };
      }

      const memories = await kv.list<Memory>(KV.memories);
      let memoriesWalked = 0;
      let edgesTouched = 0;
      for (const memory of memories) {
        if (!Array.isArray(memory.concepts) || memory.concepts.length < 2) {
          continue;
        }
        edgesTouched += await deriveConceptEdges(kv, memory.concepts);
        memoriesWalked++;
      }

      await kv.set(KV.state, MIGRATION_KEY, true);
      logger.info("Concept edges backfilled from existing memories", {
        memoriesWalked,
        edgesTouched,
      });
      return { success: true, memoriesWalked, edgesTouched };
    },
  );
}

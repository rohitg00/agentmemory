import type { ISdk } from "iii-sdk";
import type {
  SemanticMemory,
  ProceduralMemory,
  SessionSummary,
  Memory,
  MemoryProvider,
  AuditEntry,
} from "../types.js";
import { KV, fingerprintId, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import {
  SEMANTIC_MERGE_SYSTEM,
  buildSemanticMergePrompt,
  PROCEDURAL_EXTRACTION_SYSTEM,
  buildProceduralExtractionPrompt,
} from "../prompts/consolidation.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { getConsolidationDecayDays, isConsolidationEnabled } from "../config.js";
import { logger } from "../logger.js";

// Corpus-level dedup guard for the semantic merge tier. Stored in KV.config
// so the guard survives worker restarts and is shared across processes.
//
// Semantics: the fingerprint guard is UNCONDITIONAL — it applies to every
// invocation, including force:true. `force` only bypasses the
// isConsolidationEnabled() gate (policy bypass); it does not mean "re-run
// the LLM on an unchanged corpus". The automated callers (session-stop
// fan-out, eviction recovery) already check isConsolidationEnabled() before
// firing, so their force:true is redundant; it must never bypass dedup or
// the 340ms double-fire returns.
//
// Fingerprint window: the hash covers only the 20 most recent summaries
// and only {title, narrative, concepts}. Changes beyond the window (or to
// other summary fields) do not invalidate it — fine for a recency-ordered,
// append-only corpus, but the guard is NOT a full-corpus change detector.
const CORPUS_FINGERPRINT_KEY = "consolidation:corpusFingerprint";

function applyDecay(
  items: Array<{
    strength: number;
    lastAccessedAt?: string;
    updatedAt: string;
  }>,
  decayDays: number,
): void {
  if (decayDays <= 0 || !Number.isFinite(decayDays)) return;
  const now = Date.now();
  for (const item of items) {
    const lastAccess = item.lastAccessedAt || item.updatedAt;
    const daysSince =
      (now - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > decayDays) {
      const decayPeriods = Math.floor(daysSince / decayDays);
      item.strength = Math.max(
        0.1,
        item.strength * Math.pow(0.9, decayPeriods),
      );
    }
  }
}

export function registerConsolidationPipelineFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::consolidate-pipeline", 
    async (data?: { tier?: string; force?: boolean; project?: string }) => {
      // Serialize pipeline invocations in-process so concurrent triggers
      // (session-stop fan-out, 2h timer, REST trigger, eviction recovery)
      // cannot interleave two full-corpus passes on the same corpus.
      //
      // Cross-process: the CLI enforces one worker per engine (main() probes
      // /agentmemory/livez and refuses to boot a second instance, cli.ts),
      // so the in-process lock plus the KV fingerprint reserve are
      // sufficient — no distributed lease needed. Topology notes:
      // - --instance N is a port shortcut (own REST/engine port quartet),
      //   so it runs its OWN engine+worker, not a second worker on the
      //   shared engine; when instances share a data directory the KV (and
      //   the fingerprint reserve) is shared, so the reserve is the only
      //   cross-process guard, with a sub-ms read-reserve TOCTOU window
      //   that is accepted.
      // - A worker attached to an existing engine via an explicit
      //   III_ENGINE_URL/III_ENGINE_PORT override has the same property:
      //   the fingerprint reserve is the sole cross-process guard.
      return withKeyedLock("consolidation:global", async () => {
      if (!data?.force && !isConsolidationEnabled()) {
        return { success: false, skipped: true, reason: "Consolidation disabled: set CONSOLIDATION_ENABLED=true or configure an LLM provider (ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY / GOOGLE_API_KEY / MINIMAX_API_KEY / OPENAI_BASE_URL / AGENTMEMORY_PROVIDER=agent-sdk)" };
      }
      const tier = data?.tier || "all";
      const decayDays = getConsolidationDecayDays();
      const results: Record<string, unknown> = {};

      // Crash-safe audit: write the row BEFORE any LLM/state work so a kill
      // mid-pipeline (e.g. between semantic writes and completion — observed
      // 2026-09-01, semantic facts persisted with no audit row) still leaves
      // an audit trail. The row is updated in place at the end with results;
      // the stable aud_ id correlates started→completed and its timestamp is
      // the pipeline start time.
      const auditId = generateId("aud");
      const auditEntry: AuditEntry = {
        id: auditId,
        timestamp: new Date().toISOString(),
        operation: "consolidate",
        functionId: "mem::consolidate-pipeline",
        targetIds: [],
        details: { tier, project: data?.project, status: "started" },
      };
      await kv.set(KV.audit, auditId, auditEntry);

      if (tier === "all" || tier === "semantic") {
        const summaries = await kv.list<SessionSummary>(KV.summaries);
        const existingSemantic = await kv.list<SemanticMemory>(KV.semantic);

        if (summaries.length >= 5) {
          const recentSummaries = summaries
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 20);

          const corpusItems = recentSummaries.map((s) => ({
            title: s.title,
            narrative: s.narrative,
            concepts: s.concepts,
          }));
          const prompt = buildSemanticMergePrompt(corpusItems);
          const corpusFingerprint = fingerprintId(
            "consolidation",
            JSON.stringify(corpusItems),
          );

          const lastConsolidation = await kv
            .get<{ fingerprint?: string }>(KV.config, CORPUS_FINGERPRINT_KEY)
            .catch(() => null);
          if (lastConsolidation?.fingerprint === corpusFingerprint) {
            results.semantic = {
              skipped: true,
              reason: "corpus unchanged since last consolidation",
            };
          } else {
            try {
              // Reserve the fingerprint before the LLM call so a concurrent
              // identical invocation (session-stop fan-out, 2h timer, REST
              // trigger) observes the reservation and skips. iii-sdk offers
              // no CAS primitive, so this is the strongest cross-process
              // guard available; the reservation is released on failure so
              // a failed consolidation can be retried.
              await kv
                .set(KV.config, CORPUS_FINGERPRINT_KEY, {
                  fingerprint: corpusFingerprint,
                })
                .catch(() => {});
              const response = await provider.summarize(
                SEMANTIC_MERGE_SYSTEM,
                prompt,
              );

              const factRegex = /<fact\s+confidence="([^"]+)">([^<]+)<\/fact>/g;
              let match;
              let newFacts = 0;
              const now = new Date().toISOString();

              while ((match = factRegex.exec(response)) !== null) {
                const parsedConf = parseFloat(match[1]);
                const confidence = Number.isNaN(parsedConf) ? 0.5 : parsedConf;
                const fact = match[2].trim();

                const existing = existingSemantic.find(
                  (s) => s.fact.toLowerCase() === fact.toLowerCase(),
                );
                if (existing) {
                  existing.accessCount++;
                  existing.lastAccessedAt = now;
                  existing.updatedAt = now;
                  existing.confidence = Math.max(existing.confidence, confidence);
                  await kv.set(KV.semantic, existing.id, existing);
                } else {
                  const sem: SemanticMemory = {
                    id: generateId("sem"),
                    fact,
                    confidence,
                    sourceSessionIds: recentSummaries.map((s) => s.sessionId),
                    sourceMemoryIds: [],
                    accessCount: 1,
                    lastAccessedAt: now,
                    strength: confidence,
                    createdAt: now,
                    updatedAt: now,
                  };
                  await kv.set(KV.semantic, sem.id, sem);
                  newFacts++;
                }
              }
              results.semantic = { newFacts, totalSummaries: summaries.length };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.error("Semantic consolidation failed", { error: msg });
              results.semantic = { error: msg };
              await kv.delete(KV.config, CORPUS_FINGERPRINT_KEY).catch(() => {});
            }
          }
        } else {
          results.semantic = {
            skipped: true,
            reason: "fewer than 5 summaries",
          };
        }
      }

      if (tier === "all" || tier === "reflect") {
        try {
          const reflectResult = await sdk.trigger({ function_id: "mem::reflect", payload: {
            maxClusters: 10,
            project: data?.project,
          } });
          results.reflect = reflectResult;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn("Reflect tier failed", { error: msg });
          results.reflect = { error: msg };
        }
      }

      if (tier === "all" || tier === "procedural") {
        const memories = await kv.list<Memory>(KV.memories);
        const patterns = memories
          .filter((m) => m.isLatest && m.type === "pattern")
          .map((m) => ({
            content: m.content,
            frequency: m.sessionIds.length || 1,
          }))
          .filter((p) => p.frequency >= 2);

        if (patterns.length >= 2) {
          const prompt = buildProceduralExtractionPrompt(patterns);

          try {
            const response = await provider.summarize(
              PROCEDURAL_EXTRACTION_SYSTEM,
              prompt,
            );

            const procRegex =
              /<procedure\s+name="([^"]+)"\s+trigger="([^"]+)">([\s\S]*?)<\/procedure>/g;
            let match;
            let newProcs = 0;
            const now = new Date().toISOString();
            const existingProcs = await kv.list<ProceduralMemory>(
              KV.procedural,
            );

            while ((match = procRegex.exec(response)) !== null) {
              const name = match[1];
              const trigger = match[2];
              const stepsBlock = match[3];
              const steps: string[] = [];

              const stepRegex = /<step>([^<]+)<\/step>/g;
              let stepMatch;
              while ((stepMatch = stepRegex.exec(stepsBlock)) !== null) {
                steps.push(stepMatch[1].trim());
              }

              const existing = existingProcs.find(
                (p) => p.name.toLowerCase() === name.toLowerCase(),
              );
              if (existing) {
                existing.frequency++;
                existing.updatedAt = now;
                existing.strength = Math.min(1, existing.strength + 0.1);
                await kv.set(KV.procedural, existing.id, existing);
              } else {
                const proc: ProceduralMemory = {
                  id: generateId("proc"),
                  name,
                  steps,
                  triggerCondition: trigger,
                  frequency: 1,
                  sourceSessionIds: [],
                  strength: 0.5,
                  createdAt: now,
                  updatedAt: now,
                };
                await kv.set(KV.procedural, proc.id, proc);
                newProcs++;
              }
            }
            results.procedural = {
              newProcedures: newProcs,
              patternsAnalyzed: patterns.length,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error("Procedural extraction failed", { error: msg });
            results.procedural = { error: msg };
          }
        } else {
          results.procedural = {
            skipped: true,
            reason: "fewer than 2 recurring patterns",
          };
        }
      }

      if (tier === "all" || tier === "decay") {
        const semantic = await kv.list<SemanticMemory>(KV.semantic);
        applyDecay(semantic, decayDays);
        for (const s of semantic) {
          await kv.set(KV.semantic, s.id, s);
        }

        const procedural = await kv.list<ProceduralMemory>(KV.procedural);
        applyDecay(procedural, decayDays);
        for (const p of procedural) {
          await kv.set(KV.procedural, p.id, p);
        }

        results.decay = {
          semantic: semantic.length,
          procedural: procedural.length,
        };
      }

      if (process.env["OBSIDIAN_AUTO_EXPORT"] === "true") {
        try {
          await sdk.trigger({ function_id: "mem::obsidian-export", payload: {} });
          results.obsidianExport = { success: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn("Obsidian auto-export failed", { error: msg });
          results.obsidianExport = { success: false, error: msg };
        }
      }

      await kv.set(KV.audit, auditId, {
        ...auditEntry,
        details: { ...auditEntry.details, status: "completed", results },
      });

      logger.info("Consolidation pipeline complete", { tier, results });
      return { success: true, results };
      });
    },
  );
}

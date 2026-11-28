import type { IIIClient } from "iii-sdk";
import type {
  SemanticMemory,
  ProceduralMemory,
  SessionSummary,
  Memory,
  MemoryProvider,
} from "../types.js";
import { KV, generateId, jaccardSimilarity } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import {
  SEMANTIC_MERGE_SYSTEM,
  buildSemanticMergePrompt,
  PROCEDURAL_EXTRACTION_SYSTEM,
  buildProceduralExtractionPrompt,
} from "../prompts/consolidation.js";
import { recordAudit } from "./audit.js";
import { CONSOLIDATION_LAST_RUN_KEY, PROCEDURAL_MIN_SESSIONS_PER_PATTERN, patternFrequency } from "./consolidation-status.js";
import { getConsolidationDecayDays, getReflectBudgetMs, isConsolidationEnabled } from "../config.js";
import { logger } from "../logger.js";
import { REFLECT_CALL_GRACE_MS } from "./reflect.js";

// Covers reflect's reads and writes around its LLM calls.
const REFLECT_TRIGGER_HEADROOM_MS = 60_000;

function applyDecay(
  items: Array<{
    strength: number;
    lastAccessedAt?: string;
    updatedAt: string;
    lastDecayedAt?: string;
  }>,
  decayDays: number,
): void {
  if (decayDays <= 0 || !Number.isFinite(decayDays)) return;
  const now = Date.now();
  for (const item of items) {
    const lastAccess = item.lastAccessedAt || item.updatedAt;
    const lastAccessTime = new Date(lastAccess).getTime();
    const lastDecayedTime = item.lastDecayedAt
      ? new Date(item.lastDecayedAt).getTime()
      : -Infinity;
    const anchor = Math.max(lastAccessTime, lastDecayedTime);
    const daysSince = (now - anchor) / (1000 * 60 * 60 * 24);
    if (daysSince > decayDays) {
      const decayPeriods = Math.floor(daysSince / decayDays);
      item.strength = Math.max(
        0.1,
        item.strength * Math.pow(0.9, decayPeriods),
      );
      item.lastDecayedAt = new Date(now).toISOString();
    }
  }
}

const DECAY_STRENGTH_EPSILON = 1e-9;
const KNOWN_FACTS_IN_PROMPT = 40;
const SEMANTIC_DUPLICATE_SIMILARITY = 0.8;

const MEANING_WORDS = new Set(["not", "no", "never", "none", "neither", "nor", "without", "cannot", "except", "unless", "only"]);

function factWords(text: string): string[] {
  return text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
}

function changesMeaning(word: string): boolean {
  return /\p{N}/u.test(word) || MEANING_WORDS.has(word) || word.endsWith("n't");
}

export function isRestatement(a: string, b: string): boolean {
  const wordsA = factWords(a);
  const wordsB = factWords(b);
  const [short, long] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  let matched = 0;
  const added: string[] = [];
  for (const word of long) {
    if (matched < short.length && word === short[matched]) matched++;
    else added.push(word);
  }
  return matched === short.length && !added.some(changesMeaning);
}

export function matchSemanticFact(existing: SemanticMemory[], fact: string, ref?: string): SemanticMemory | undefined {
  const referenced = ref ? existing.find((s) => s.id === ref) : undefined;
  if (referenced) return referenced;
  const lower = fact.toLowerCase();
  let best: SemanticMemory | undefined;
  let bestScore = SEMANTIC_DUPLICATE_SIMILARITY;
  for (const s of existing) {
    if (typeof s.fact !== "string") continue;
    const candidate = s.fact.toLowerCase();
    if (candidate === lower) return s;
    const score = jaccardSimilarity(candidate, lower);
    if (score >= bestScore && isRestatement(candidate, lower)) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function strengthChanged(before: number, after: number): boolean {
  return Math.abs(after - before) > DECAY_STRENGTH_EPSILON;
}

async function decayAndWriteChanged<
  T extends {
    id: string;
    strength: number;
    lastAccessedAt?: string;
    updatedAt: string;
    lastDecayedAt?: string;
  },
>(
  kv: StateKV,
  scope: string,
  items: T[],
  decayDays: number,
): Promise<{ scanned: number; written: number }> {
  const before = items.map((item) => item.strength);
  applyDecay(items, decayDays);
  const dirty = items.filter((item, i) => strengthChanged(before[i], item.strength));
  for (const item of dirty) {
    await kv.set(scope, item.id, item);
  }
  return { scanned: items.length, written: dirty.length };
}

export function registerConsolidationPipelineFunction(
  sdk: IIIClient,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::consolidate-pipeline", 
    async (data?: { tier?: string; force?: boolean; project?: string }) => {
      if (!data?.force && !isConsolidationEnabled()) {
        return { success: false, skipped: true, reason: "Consolidation disabled: set CONSOLIDATION_ENABLED=true or choose an LLM provider (AGENTMEMORY_LLM_PROVIDER=anthropic, openai, gemini, openrouter or minimax with that provider's key, or AGENTMEMORY_ALLOW_AGENT_SDK=true). A provider key alone does not turn on LLM use." };
      }
      const tier = data?.tier || "all";
      const decayDays = getConsolidationDecayDays();
      const results: Record<string, unknown> = {};

      if (tier === "all" || tier === "semantic") {
        const summaries = await kv.list<SessionSummary>(KV.summaries);
        const existingSemantic = await collectAll<SemanticMemory>(kv, KV.semantic);

        if (summaries.length >= 5) {
          const recentSummaries = summaries
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 20);

          const known = existingSemantic
            .filter((s) => s && typeof s.id === "string" && typeof s.fact === "string")
            .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
            .slice(0, KNOWN_FACTS_IN_PROMPT)
            .map((s) => ({ id: s.id, fact: s.fact.slice(0, 300) }));
          const prompt = buildSemanticMergePrompt(
            recentSummaries.map((s) => ({
              title: s.title,
              narrative: s.narrative,
              concepts: s.concepts,
            })),
            known,
          );

          try {
            const response = await provider.summarize(
              SEMANTIC_MERGE_SYSTEM,
              prompt,
            );

            const factRegex = /<fact\b([^>]*)>([^<]+)<\/fact>/g;
            let match;
            let newFacts = 0;
            const now = new Date().toISOString();

            while ((match = factRegex.exec(response)) !== null) {
              const attrs = match[1];
              const parsedConf = parseFloat(/confidence="([^"]*)"/.exec(attrs)?.[1] ?? "");
              const confidence = Number.isNaN(parsedConf) ? 0.5 : Math.min(1, Math.max(0, parsedConf));
              const fact = match[2].trim();
              if (!fact) continue;

              const existing = matchSemanticFact(existingSemantic, fact, /ref="([^"]*)"/.exec(attrs)?.[1]);
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
                existingSemantic.push(sem);
                newFacts++;
              }
            }
            results.semantic = { newFacts, totalSummaries: summaries.length };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error("Semantic consolidation failed", { error: msg });
            results.semantic = { error: msg };
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
          // Reflect makes one LLM call per cluster, one after another. It
          // stops starting calls when its budget runs short and skips clusters
          // whose evidence has not changed, so a slow provider finishes the
          // work over several runs. The wait covers the budget and the grace
          // a call started within it may use, so the pipeline never gives up
          // on a reflect that is still running.
          const budgetMs = getReflectBudgetMs();
          const reflectResult = await sdk.trigger({
            function_id: "mem::reflect",
            payload: {
              maxClusters: 10,
              project: data?.project,
              budgetMs,
              skipUnchanged: true,
            },
            timeoutMs: budgetMs + REFLECT_CALL_GRACE_MS + REFLECT_TRIGGER_HEADROOM_MS,
          });
          results.reflect = reflectResult;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn("Reflect tier failed", { error: msg });
          results.reflect = { error: msg };
        }
      }

      if (tier === "all" || tier === "procedural") {
        const memories = await collectAll<Memory>(kv, KV.memories);
        const patterns = memories
          .filter((m) => m.isLatest && m.type === "pattern")
          .map((m) => ({
            content: m.content,
            frequency: patternFrequency(m),
          }))
          .filter((p) => p.frequency >= PROCEDURAL_MIN_SESSIONS_PER_PATTERN);

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
            const existingProcs = await collectAll<ProceduralMemory>(
              kv, KV.procedural,
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
        const semantic = await collectAll<SemanticMemory>(kv, KV.semantic);
        const procedural = await collectAll<ProceduralMemory>(kv, KV.procedural);

        const semanticResult = await decayAndWriteChanged(
          kv,
          KV.semantic,
          semantic,
          decayDays,
        );
        const proceduralResult = await decayAndWriteChanged(
          kv,
          KV.procedural,
          procedural,
          decayDays,
        );

        results.decay = {
          semantic: semanticResult,
          procedural: proceduralResult,
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

      await recordAudit(kv, "consolidate", "mem::consolidate-pipeline", [], {
        tier,
        results,
      });

      await kv
        .set(KV.config, CONSOLIDATION_LAST_RUN_KEY, { at: new Date().toISOString(), tier, results })
        .catch(() => {});

      logger.info("Consolidation pipeline complete", { tier, results });
      return { success: true, results };
    },
  );
}

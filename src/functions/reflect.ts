import { pinGraphState } from "../state/graph-generation.js";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, fingerprintId } from "../state/schema.js";
import type {
  Insight,
  GraphNode,
  GraphEdge,
  SemanticMemory,
  Lesson,
  Crystal,
  MemoryProvider,
} from "../types.js";
import { recordAudit } from "./audit.js";
import { REFLECT_SYSTEM, buildReflectPrompt } from "../prompts/reflect.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { checkPayloadFrameSize, payloadByteLength } from "../state/frame-guard.js";

export const INSIGHT_MAX_RESULTS = 500;
export const INSIGHT_MAX_SOURCES = 20;
export const REFLECT_MAX_RECORD_BYTES = 4 * 1024;
export const REFLECT_MAX_TYPE_BYTES = 16 * 1024;
export const REFLECT_MAX_CONCEPTS = 32;
export const REFLECT_MAX_CONCEPT_BYTES = 128;
export const REFLECT_MAX_RESPONSE_BYTES = 64 * 1024;

function positiveLimit(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return null;
  return Math.min(value, maximum);
}

function validConfidence(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function invalidOption(error: string): { success: false; invalid: true; error: string } {
  return { success: false, invalid: true, error };
}

function selectEvidence<T extends { id: string }>(items: T[], record: (item: T) => unknown): T[] {
  const selected: T[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const item of items) {
    if (selected.length >= INSIGHT_MAX_SOURCES) break;
    if (seen.has(item.id)) continue;
    const size = payloadByteLength([item.id, record(item)]);
    if (size > REFLECT_MAX_RECORD_BYTES || bytes + size > REFLECT_MAX_TYPE_BYTES) continue;
    selected.push(item);
    seen.add(item.id);
    bytes += size;
  }
  return selected;
}

interface ConceptCluster {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{ content: string; confidence: number }>;
  crystalNarratives: string[];
  factIds: string[];
  lessonIds: string[];
  crystalIds: string[];
}

function parseInsight(attributes: string, content: string, cluster: ConceptCluster) {
  const attributePattern = /(?:^|\s)(confidence|title|sources)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  if (attributes.replace(attributePattern, "").trim()) return null;
  const values = new Map<string, string>();
  for (const match of attributes.matchAll(attributePattern)) {
    if (values.has(match[1])) return null;
    values.set(match[1], match[2] ?? match[3]);
  }
  const confidenceText = values.get("confidence")?.trim();
  const confidence = Number(confidenceText);
  let title = values.get("title")?.trim();
  content = content.trim();
  if (!confidenceText || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !title || !content || /<\/?insight\b/.test(content)) return null;

  title = decodeXmlText(title);
  content = decodeXmlText(content);
  if (Buffer.byteLength(title, "utf8") > 256 || Buffer.byteLength(content, "utf8") > REFLECT_MAX_RECORD_BYTES) return null;

  const sourceMemoryIds = new Set<string>();
  const sourceLessonIds = new Set<string>();
  const sourceCrystalIds = new Set<string>();
  for (const label of new Set((values.get("sources") ?? "").split(/[\s,]+/).filter(Boolean))) {
    const match = /^([FLC])([1-9]\d*)$/.exec(label);
    if (!match) return null;
    const index = Number(match[2]) - 1;
    const [ids, selected] = match[1] === "F" ? [cluster.factIds, sourceMemoryIds]
      : match[1] === "L" ? [cluster.lessonIds, sourceLessonIds]
      : [cluster.crystalIds, sourceCrystalIds];
    const id = ids[index];
    if (typeof id !== "string" || !id) return null;
    selected.add(id);
  }
  const sourceCount = sourceMemoryIds.size + sourceLessonIds.size + sourceCrystalIds.size;
  if (sourceCount < 2 || sourceCount > INSIGHT_MAX_SOURCES) return null;
  return {
    confidence, title, content,
    sourceMemoryIds: [...sourceMemoryIds],
    sourceLessonIds: [...sourceLessonIds],
    sourceCrystalIds: [...sourceCrystalIds],
  };
}

function decodeXmlText(text: string): string {
  const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => entities[entity]);
}

async function evidenceStillCurrent(
  kv: StateKV,
  parsed: NonNullable<ReturnType<typeof parseInsight>>,
  cluster: ConceptCluster,
): Promise<boolean> {
  const checks = [
    ...parsed.sourceMemoryIds.map((id) => ({
      scope: KV.semantic, id, field: "fact",
      text: cluster.facts[cluster.factIds.indexOf(id)].fact,
    })),
    ...parsed.sourceLessonIds.map((id) => ({
      scope: KV.lessons, id, field: "content",
      text: cluster.lessons[cluster.lessonIds.indexOf(id)].content,
    })),
    ...parsed.sourceCrystalIds.map((id) => ({
      scope: KV.crystals, id, field: "narrative",
      text: cluster.crystalNarratives[cluster.crystalIds.indexOf(id)],
    })),
  ];
  return (await Promise.all(checks.map(async ({ scope, id, field, text }) => {
    const current = await kv.get<Record<string, unknown>>(scope, id);
    return !!current && current[field] === text && current.deleted !== true;
  }))).every(Boolean);
}

function reinforceInsight(insight: Insight): void {
  const now = new Date().toISOString();
  insight.reinforcements++;
  insight.confidence = Math.min(
    1.0,
    insight.confidence + 0.1 * (1 - insight.confidence),
  );
  insight.lastReinforcedAt = now;
  insight.updatedAt = now;
}

function buildGraphClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxClusters: number,
): string[][] {
  const conceptNodes = nodes.filter(
    (n) => n.type === "concept" && !n.stale,
  );
  if (conceptNodes.length === 0) return [];

  const edgeMap = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.stale) continue;
    if (!edgeMap.has(edge.sourceNodeId))
      edgeMap.set(edge.sourceNodeId, new Set());
    if (!edgeMap.has(edge.targetNodeId))
      edgeMap.set(edge.targetNodeId, new Set());
    edgeMap.get(edge.sourceNodeId)!.add(edge.targetNodeId);
    edgeMap.get(edge.targetNodeId)!.add(edge.sourceNodeId);
  }

  const degree = new Map<string, number>();
  for (const node of conceptNodes) {
    degree.set(node.id, edgeMap.get(node.id)?.size || 0);
  }

  const sorted = [...conceptNodes].sort(
    (a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0),
  );

  const visited = new Set<string>();
  const clusters: string[][] = [];
  const conceptNodeIds = new Set(conceptNodes.map((n) => n.id));

  for (const seed of sorted) {
    if (visited.has(seed.id) || clusters.length >= maxClusters) break;

    const cluster: string[] = [];
    const queue = [seed.id];
    const seen = new Set<string>();
    let depth = 0;

    while (queue.length > 0 && depth <= 2) {
      const levelCount = queue.length;
      for (let i = 0; i < levelCount; i++) {
        const current = queue.shift()!;
        if (seen.has(current)) continue;
        seen.add(current);

        if (conceptNodeIds.has(current)) {
          const node = conceptNodes.find((n) => n.id === current);
          if (node) cluster.push(node.name);
          visited.add(current);
        }

        const neighbors = edgeMap.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!seen.has(neighbor)) queue.push(neighbor);
        }
      }
      depth++;
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

function buildJaccardClusters(
  semanticMemories: SemanticMemory[],
  lessons: Lesson[],
  maxClusters: number,
): string[][] {
  const allConcepts = new Map<string, Set<string>>();

  for (const sem of semanticMemories) {
    const terms = sem.fact.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    for (const term of terms) {
      if (!allConcepts.has(term)) allConcepts.set(term, new Set());
      allConcepts.get(term)!.add(sem.id);
    }
  }
  for (const lesson of lessons) {
    for (const tag of lesson.tags) {
      const key = tag.toLowerCase();
      if (!allConcepts.has(key)) allConcepts.set(key, new Set());
      allConcepts.get(key)!.add(lesson.id);
    }
  }

  const conceptList = [...allConcepts.keys()].filter(
    (k) => (allConcepts.get(k)?.size || 0) >= 2,
  );

  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const concept of conceptList) {
    if (visited.has(concept) || clusters.length >= maxClusters) break;

    const cluster = [concept];
    visited.add(concept);

    const docsA = allConcepts.get(concept) || new Set();
    for (const other of conceptList) {
      if (visited.has(other)) continue;
      const docsB = allConcepts.get(other) || new Set();
      let intersection = 0;
      for (const d of docsA) {
        if (docsB.has(d)) intersection++;
      }
      const union = docsA.size + docsB.size - intersection;
      const similarity = union > 0 ? intersection / union : 0;
      if (similarity > 0.3) {
        cluster.push(other);
        visited.add(other);
      }
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

export function registerReflectFunctions(
  sdk: IIIClient,
  state: StateKV,
  provider: MemoryProvider,
): void {
  const kv = state;
  sdk.registerFunction("mem::reflect", 
    async (data: { maxClusters?: number; project?: string }) => {
      const maxClusters = positiveLimit(data?.maxClusters, 10, 20);
      if (maxClusters === null) return invalidOption("maxClusters must be a positive safe integer");
      const kv = await pinGraphState(state);
      const maxInsightsPerCluster = 5;
      const maxTotal = 50;

      const [graphNodes, graphEdges, semanticMemories, lessons, crystals] =
        await Promise.all([
          kv.list<GraphNode>(KV.graphNodes).catch(() => []),
          kv.list<GraphEdge>(KV.graphEdges).catch(() => []),
          kv.list<SemanticMemory>(KV.semantic).catch(() => []),
          kv.list<Lesson>(KV.lessons).catch(() => []),
          kv.list<Crystal>(KV.crystals).catch(() => []),
        ]);

      let activeLessons = lessons.filter((l) => !l.deleted);
      if (data?.project) {
        activeLessons = activeLessons.filter((l) => l.project === data.project);
      }

      let conceptClusters = buildGraphClusters(
        graphNodes,
        graphEdges,
        maxClusters,
      );

      const usedFallback = conceptClusters.length === 0;
      if (usedFallback) {
        conceptClusters = buildJaccardClusters(
          semanticMemories,
          activeLessons,
          maxClusters,
        );
      }

      let newInsights = 0;
      let reinforced = 0;
      let clustersSkipped = 0;
      let totalInsights = 0;
      let rejectedInsights = 0;
      let failedClusters = 0;
      const acceptedIds = new Set<string>();

      for (const candidates of conceptClusters) {
        if (totalInsights >= maxTotal) break;
        const conceptNames = [...new Set(candidates)]
          .filter((name) => payloadByteLength(name) <= REFLECT_MAX_CONCEPT_BYTES)
          .slice(0, REFLECT_MAX_CONCEPTS);

        const conceptSet = new Set(conceptNames.map((c) => c.toLowerCase()));

        const clusterFacts = selectEvidence(semanticMemories.filter((s) => {
          const factTerms = s.fact.toLowerCase().split(/\s+/);
          return factTerms.some((t) => conceptSet.has(t));
        }), (f) => ({ source: `F${INSIGHT_MAX_SOURCES}`, fact: f.fact, confidence: f.confidence }));

        const clusterLessons = selectEvidence(activeLessons.filter((l) =>
          l.tags.some((t) => conceptSet.has(t.toLowerCase())) ||
          conceptNames.some((c) =>
            l.content.toLowerCase().includes(c.toLowerCase()),
          ),
        ), (l) => ({ source: `L${INSIGHT_MAX_SOURCES}`, content: l.content, confidence: l.confidence }));

        const clusterCrystals = selectEvidence(crystals.filter((c) =>
          (c.lessons || []).some((l) =>
            conceptNames.some((cn) =>
              l.toLowerCase().includes(cn.toLowerCase()),
            ),
          ),
        ), (c) => ({ source: `C${INSIGHT_MAX_SOURCES}`, narrative: c.narrative }));

        const totalItems =
          clusterFacts.length + clusterLessons.length + clusterCrystals.length;
        if (totalItems < 3) {
          clustersSkipped++;
          continue;
        }

        const cluster: ConceptCluster = {
          concepts: conceptNames,
          facts: clusterFacts.map((f) => ({
            fact: f.fact,
            confidence: f.confidence,
          })),
          lessons: clusterLessons.map((l) => ({
            content: l.content,
            confidence: l.confidence,
          })),
          crystalNarratives: clusterCrystals.map((c) => c.narrative),
          factIds: clusterFacts.map((f) => f.id),
          lessonIds: clusterLessons.map((l) => l.id),
          crystalIds: clusterCrystals.map((c) => c.id),
        };

        try {
          const prompt = buildReflectPrompt(cluster);
          const response = await provider.summarize(REFLECT_SYSTEM, prompt);
          if (Buffer.byteLength(response, "utf8") > REFLECT_MAX_RESPONSE_BYTES) {
            failedClusters++;
            continue;
          }

          const matches = [...response.matchAll(/<insight\b([^<>]*)>([\s\S]*?)<\/insight>/g)];
          const incomplete = (response.match(/<insight\b/g) ?? []).length - matches.length;
          if (incomplete > 0) {
            rejectedInsights += incomplete;
            failedClusters++;
          }
          if (matches.length === 0) {
            if (!incomplete && !/<insights>\s*<\/insights>/.test(response)) failedClusters++;
            continue;
          }
          let clusterCount = 0;

          for (const match of matches) {
            if (clusterCount >= maxInsightsPerCluster || totalInsights >= maxTotal) break;
            const parsed = parseInsight(match[1], match[2], cluster);
            if (!parsed) {
              rejectedInsights++;
              continue;
            }
            const { confidence, title, content } = parsed;

            const fp = fingerprintId("ins_v1", JSON.stringify([1, data?.project || null, content.toLowerCase()]));
            if (acceptedIds.has(fp)) {
              rejectedInsights++;
              continue;
            }
            const accepted = await withKeyedLock(`insight:${fp}`, async () => {
              if (!await evidenceStillCurrent(kv, parsed, cluster)) return false;
              const existing = await kv.get<Insight>(KV.insights, fp);
              const evidence = {
                sourceMemoryIds: parsed.sourceMemoryIds,
                sourceLessonIds: parsed.sourceLessonIds,
                sourceCrystalIds: parsed.sourceCrystalIds,
                evidenceVersion: 1 as const,
              };
              if (existing && !existing.deleted) {
                const insight = {
                  ...existing, ...evidence, title,
                  sourceConceptCluster: conceptNames, tags: conceptNames,
                };
                reinforceInsight(insight);
                await kv.set(KV.insights, insight.id, insight);
                reinforced++;
              } else {
                const now = new Date().toISOString();
                const insight: Insight = {
                  id: fp, title, content, confidence,
                  reinforcements: 0,
                  sourceConceptCluster: conceptNames,
                  ...evidence,
                  project: data?.project,
                  tags: conceptNames,
                  createdAt: now, updatedAt: now,
                  decayRate: 0.05,
                };
                await kv.set(KV.insights, insight.id, insight);
                newInsights++;
              }
              return true;
            });
            if (!accepted) {
              rejectedInsights++;
              continue;
            }
            acceptedIds.add(fp);

            clusterCount++;
            totalInsights++;
          }
        } catch {
          failedClusters++;
          continue;
        }
      }

      try {
        await recordAudit(kv, "reflect", "mem::reflect", [], {
          newInsights,
          reinforced,
          clustersProcessed: conceptClusters.length - clustersSkipped,
          clustersSkipped,
          usedFallback,
          rejectedInsights,
          failedClusters,
        });
      } catch {}

      return {
        success: failedClusters === 0,
        newInsights,
        reinforced,
        clustersProcessed: conceptClusters.length - clustersSkipped,
        clustersSkipped,
        usedFallback,
        rejectedInsights,
        failedClusters,
      };
    },
  );

  sdk.registerFunction("mem::insight-list", 
    async (data: {
      project?: string;
      minConfidence?: number;
      limit?: number;
    }) => {
      const limit = positiveLimit(data?.limit, 50, INSIGHT_MAX_RESULTS);
      if (limit === null) return invalidOption("limit must be a positive safe integer");
      if (!validConfidence(data?.minConfidence)) return invalidOption("minConfidence must be a finite number between 0 and 1");
      const minConfidence = data?.minConfidence ?? 0;
      let items = await kv.list<Insight>(KV.insights);

      items = items.filter(
        (i) => !i.deleted && i.confidence >= minConfidence,
      );

      if (data?.project) {
        items = items.filter((i) => i.project === data.project);
      }

      items.sort((a, b) => b.confidence - a.confidence);

      const result = { success: true, insights: items.slice(0, limit) };
      return checkPayloadFrameSize(result, "reduce limit or filter by project") ?? result;
    },
  );

  sdk.registerFunction("mem::insight-search", 
    async (data: {
      query: string;
      project?: string;
      minConfidence?: number;
      limit?: number;
    }) => {
      if (typeof data?.query !== "string" || !data.query.trim()) {
        return invalidOption("query is required");
      }
      const limit = positiveLimit(data.limit, 10, INSIGHT_MAX_RESULTS);
      if (limit === null) return invalidOption("limit must be a positive safe integer");
      if (!validConfidence(data.minConfidence)) return invalidOption("minConfidence must be a finite number between 0 and 1");
      const query = data.query.toLowerCase();
      const minConfidence = data.minConfidence ?? 0.1;

      let items = await kv.list<Insight>(KV.insights);
      items = items.filter(
        (i) => !i.deleted && i.confidence >= minConfidence,
      );

      if (data.project) {
        items = items.filter((i) => i.project === data.project);
      }

      const terms = query.split(/\s+/).filter((t) => t.length > 1);
      const scored = items
        .map((i) => {
          const text =
            `${i.title} ${i.content} ${i.tags.join(" ")}`.toLowerCase();
          const matchCount = terms.filter((t) => text.includes(t)).length;
          if (matchCount === 0) return null;

          const relevance = matchCount / terms.length;
          const daysSince = i.lastReinforcedAt
            ? (Date.now() - new Date(i.lastReinforcedAt).getTime()) /
              (1000 * 60 * 60 * 24)
            : (Date.now() - new Date(i.createdAt).getTime()) /
              (1000 * 60 * 60 * 24);
          const recencyBoost = 1 / (1 + daysSince * 0.01);
          const score = i.confidence * relevance * recencyBoost;

          return { insight: i, score };
        })
        .filter(Boolean) as Array<{ insight: Insight; score: number }>;

      scored.sort((a, b) => b.score - a.score);

      try {
        await recordAudit(kv, "insight_search", "mem::insight-search", [], {
          query: data.query,
          resultCount: scored.length,
        });
      } catch {}

      const result = {
        success: true,
        insights: scored.slice(0, limit).map((s) => ({
          ...s.insight,
          score: Math.round(s.score * 1000) / 1000,
        })),
      };
      return checkPayloadFrameSize(result, "reduce limit or narrow the search") ?? result;
    },
  );

  sdk.registerFunction("mem::insight-decay-sweep", 
    async () => {
      const items = await kv.list<Insight>(KV.insights);
      let decayed = 0;
      let softDeleted = 0;
      const now = Date.now();
      const timestamp = new Date().toISOString();
      const dirty: Insight[] = [];

      for (const item of items) {
        await withKeyedLock(`insight:${item.id}`, async () => {
          const current = await kv.get<Insight>(KV.insights, item.id);
          if (!current || current.deleted) return;
          const insight = { ...current };
          const baseline = Math.max(...[
            insight.createdAt, insight.lastDecayedAt, insight.lastReinforcedAt,
          ].filter((date): date is string => !!date).map((date) => new Date(date).getTime()));
          const weeksSince = (now - baseline) / (1000 * 60 * 60 * 24 * 7);
          if (!Number.isFinite(weeksSince) || weeksSince < 1) return;

          const newConfidence = Math.max(0.05, insight.confidence - insight.decayRate * weeksSince);
          if (newConfidence === insight.confidence) return;
          insight.confidence = Math.round(newConfidence * 1000) / 1000;
          insight.lastDecayedAt = timestamp;
          insight.updatedAt = timestamp;
          if (insight.confidence <= 0.1 && insight.reinforcements === 0) insight.deleted = true;
          await kv.set(KV.insights, insight.id, insight);
          if (insight.deleted) softDeleted++;
          else decayed++;
          dirty.push(insight);
        });
      }

      await recordAudit(kv, "reflect", "mem::insight-decay-sweep", dirty.map((i) => i.id), {
        event: "insight.decay",
        decayed,
        softDeleted,
        total: items.length,
        timestamp,
      });

      return { success: true, decayed, softDeleted, total: items.length };
    },
  );
}

import { createGraphIndexReader, graphEdgeLookupKey, normalizeGraphIndexText } from "../state/graph-retrieval-index.js";
import { persistGraphRecords } from "../state/graph-ingestion.js";
import { readIndexedEntity } from "./graph-index-temporal.js";
import { pinGraphState } from "../state/graph-generation.js";
import type { IIIClient } from "iii-sdk";
import type {
  GraphNode,
  GraphEdge,
  GraphEdgeType,
  EdgeContext,
  TemporalState,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { boundSources } from "./graph.js";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";

const TEMPORAL_EXTRACTION_SYSTEM = `You are a temporal knowledge extraction engine. Given observations, extract entities AND their temporal relationships with full context metadata.

For each relationship, you MUST provide:
1. Semantic relation type
2. Temporal validity (when this fact became true in the real world)
3. Context metadata: WHY this relationship exists, what reasoning led to it, what alternatives were considered

Output EXACTLY this XML:
<temporal_graph>
  <entities>
    <entity type="file|function|concept|error|decision|pattern|library|person|project|preference|location|organization|event" name="exact name">
      <property key="key">value</property>
      <alias>alternate name</alias>
    </entity>
  </entities>
  <relationships>
    <relationship type="uses|imports|modifies|causes|fixes|depends_on|related_to|works_at|prefers|blocked_by|caused_by|optimizes_for|rejected|avoids|located_in|succeeded_by"
      source="entity name" target="entity name" weight="0.1-1.0"
      valid_from="ISO date or 'unknown'" valid_to="ISO date or 'current'">
      <reasoning>WHY this relationship exists</reasoning>
      <sentiment>positive|negative|neutral</sentiment>
      <alternatives>
        <alt>alternative that was considered</alt>
      </alternatives>
    </relationship>
  </relationships>
</temporal_graph>

Rules:
- NEVER overwrite existing relationships — always create new versioned edges
- Extract temporal validity from context clues ("since last month", "in 2024", "currently")
- Capture reasoning/motivation behind each relationship
- Weight relationships by directness: 1.0 = explicit statement, 0.5 = inferred, 0.1 = speculative`;

function parseTemporalGraphXml(
  xml: string,
  observationIds: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const now = new Date().toISOString();

  const entityRegex =
    /<entity\s+type="([^"]+)"\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/entity>/g;
  let match;
  while ((match = entityRegex.exec(xml)) !== null) {
    const type = match[1] as GraphNode["type"];
    const name = match[2];
    const propsBlock = match[3];
    const properties: Record<string, string> = {};
    const aliases: string[] = [];

    const propRegex = /<property\s+key="([^"]+)">([^<]*)<\/property>/g;
    let propMatch;
    while ((propMatch = propRegex.exec(propsBlock)) !== null) {
      properties[propMatch[1]] = propMatch[2];
    }

    const aliasRegex = /<alias>([^<]+)<\/alias>/g;
    while ((propMatch = aliasRegex.exec(propsBlock)) !== null) {
      aliases.push(propMatch[1]);
    }

    nodes.push({
      id: generateId("gn"),
      type,
      name,
      properties,
      sourceObservationIds: observationIds,
      createdAt: now,
      aliases: aliases.length > 0 ? aliases : undefined,
    });
  }

  const relRegex =
    /<relationship\s+type="([^"]+)"\s+source="([^"]+)"\s+target="([^"]+)"\s+weight="([^"]+)"(?:\s+valid_from="([^"]*)")?(?:\s+valid_to="([^"]*)")?[^>]*>([\s\S]*?)<\/relationship>/g;
  while ((match = relRegex.exec(xml)) !== null) {
    const type = match[1] as GraphEdgeType;
    const sourceName = match[2];
    const targetName = match[3];
    const parsedWeight = parseFloat(match[4]);
    const weight = Number.isNaN(parsedWeight) ? 0.5 : parsedWeight;
    const validFrom = match[5] || undefined;
    const validTo = match[6] || undefined;
    const metaBlock = match[7] || "";

    const sourceNode = nodes.find(
      (n) =>
        n.name === sourceName ||
        (n.aliases && n.aliases.includes(sourceName)),
    );
    const targetNode = nodes.find(
      (n) =>
        n.name === targetName ||
        (n.aliases && n.aliases.includes(targetName)),
    );

    if (sourceNode && targetNode) {
      const reasoning =
        metaBlock.match(/<reasoning>([^<]*)<\/reasoning>/)?.[1] || undefined;
      const sentiment =
        metaBlock.match(/<sentiment>([^<]*)<\/sentiment>/)?.[1] || undefined;
      const alternatives: string[] = [];
      const altRegex = /<alt>([^<]+)<\/alt>/g;
      let altMatch;
      while ((altMatch = altRegex.exec(metaBlock)) !== null) {
        alternatives.push(altMatch[1]);
      }

      const context: EdgeContext = {};
      if (reasoning) context.reasoning = reasoning;
      if (sentiment) context.sentiment = sentiment;
      if (alternatives.length > 0) context.alternatives = alternatives;
      context.confidence = Math.max(0, Math.min(1, weight));

      edges.push({
        id: generateId("ge"),
        type,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        weight: Math.max(0, Math.min(1, weight)),
        sourceObservationIds: observationIds,
        createdAt: now,
        tcommit: now,
        tvalid:
          validFrom && validFrom !== "unknown" ? validFrom : undefined,
        tvalidEnd:
          validTo && validTo !== "current" ? validTo : undefined,
        context: Object.keys(context).length > 0 ? context : undefined,
        version: 1,
        isLatest: true,
      });
    }
  }

  return { nodes, edges };
}

export function registerTemporalGraphFunctions(
  sdk: IIIClient,
  state: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::temporal-graph-extract", 
    async (data: {
      observations: Array<{
        id: string;
        title: string;
        narrative: string;
        concepts: string[];
        files: string[];
        type: string;
        timestamp: string;
      }>;
    }) => {
      const kv = await pinGraphState(state);
      if (!data.observations || data.observations.length === 0) {
        return { success: false, error: "No observations provided" };
      }

      const items = data.observations
        .map(
          (o, i) =>
            `[${i + 1}] Type: ${o.type}\nTimestamp: ${o.timestamp}\nTitle: ${o.title}\nNarrative: ${o.narrative}\nConcepts: ${(o.concepts ?? []).join(", ")}\nFiles: ${(o.files ?? []).join(", ")}`,
        )
        .join("\n\n");

      try {
        const response = await provider.compress(
          TEMPORAL_EXTRACTION_SYSTEM,
          `Extract temporal knowledge graph from:\n\n${items}`,
        );

        const obsIds = data.observations.map((o) => o.id);
        const { nodes, edges } = parseTemporalGraphXml(response, obsIds);

        await withKeyedLock("graph:persist", async () => {
          const idRemap = new Map<string, string>();
          for (const node of nodes) {
            const reader = await createGraphIndexReader(kv);
            if (!reader) throw new Error("Graph index unavailable; run agentmemory graph-index migrate --allow-legacy-scan");
            const names = await reader.posting("name", normalizeGraphIndexText(node.name), { limit: 64 });
            let existing: GraphNode | null = null;
            for (const id of names.ids) {
              const candidate = await reader.getNode(id);
              if (candidate && !candidate.stale && candidate.name === node.name && candidate.type === node.type && (!existing || candidate.id < existing.id)) {
                existing = await kv.get<GraphNode>(KV.graphNodes, id);
              }
            }
            if (names.cursor || reader.exhausted || !await reader.finish()) throw new Error("Temporal node reconciliation exceeded the graph read budget or changed revision");
            if (existing) {
              const oldId = node.id;
              const merged = {
                ...existing,
                sourceObservationIds: boundSources(
                  existing.sourceObservationIds ?? [],
                  node.sourceObservationIds ?? [],
                ),
                properties: { ...existing.properties, ...node.properties },
                updatedAt: new Date().toISOString(),
                aliases: [
                  ...new Set([
                    ...(existing.aliases || []),
                    ...(node.aliases || []),
                  ]),
                ],
              };
              if (merged.aliases.length === 0) delete (merged as any).aliases;
              await persistGraphRecords(kv, [merged], []);
              node.id = existing.id;
              idRemap.set(oldId, existing.id);
            } else {
              node.sourceObservationIds = boundSources([], node.sourceObservationIds ?? []);
              await persistGraphRecords(kv, [node], []);
            }
          }

          for (const edge of edges) {
            if (idRemap.has(edge.sourceNodeId)) {
              edge.sourceNodeId = idRemap.get(edge.sourceNodeId)!;
            }
            if (idRemap.has(edge.targetNodeId)) {
              edge.targetNodeId = idRemap.get(edge.targetNodeId)!;
            }
            const reader = await createGraphIndexReader(kv);
            if (!reader) throw new Error("Graph index unavailable during temporal reconciliation");
            let cursor: string | undefined;
            let existingEdge: GraphEdge | null = null;
            do {
              const page = await reader.posting("edgeKey", graphEdgeLookupKey(edge), { cursor, limit: 64 });
              for (const id of page.ids) {
                const candidate = await reader.getEdge(id);
                if (candidate && !candidate.stale && candidate.isLatest !== false &&
                    candidate.sourceNodeId === edge.sourceNodeId && candidate.targetNodeId === edge.targetNodeId && candidate.type === edge.type &&
                    (!existingEdge || (candidate.version ?? 1) > (existingEdge.version ?? 1) ||
                      (candidate.version ?? 1) === (existingEdge.version ?? 1) && candidate.id < existingEdge.id)) {
                  const canonical = await reader.read<GraphEdge>(KV.graphEdges, id);
                  if (reader.exhausted) break;
                  if (!canonical || canonical.id !== id || canonical.stale || canonical.isLatest === false || graphEdgeLookupKey(canonical) !== graphEdgeLookupKey(edge)) {
                    throw new Error("Temporal edge reconciliation found a missing or changed canonical predecessor");
                  }
                  existingEdge = canonical;
                }
              }
              cursor = page.cursor ?? undefined;
            } while (cursor && !reader.exhausted);
            if (cursor || reader.exhausted || !await reader.finish()) throw new Error("Temporal edge reconciliation exceeded the graph read budget or changed revision");
            edge.sourceObservationIds = boundSources([], edge.sourceObservationIds ?? []);
            if (existingEdge) {
              const updatedOld = {
                ...existingEdge,
                isLatest: false,
                tvalidEnd:
                  existingEdge.tvalidEnd || new Date().toISOString(),
                supersededBy: edge.id,
              };
              edge.version = (existingEdge.version || 1) + 1;
              await persistGraphRecords(kv, [], [updatedOld, edge]);
              await kv.set(KV.graphEdgeHistory, existingEdge.id, updatedOld);
            } else {
              await persistGraphRecords(kv, [], [edge]);
            }
          }
        });

        logger.info("Temporal graph extraction complete", {
          nodes: nodes.length,
          edges: edges.length,
        });
        return {
          success: true,
          nodesAdded: nodes.length,
          edgesAdded: edges.length,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Temporal graph extraction failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction("mem::temporal-query", 
    async (data: {
      entityName: string;
      asOf?: string;
      includeHistory?: boolean;
    }): Promise<(TemporalState & { truncated: boolean }) | { error: string }> => {
      const kv = await pinGraphState(state);
      if (data.asOf !== undefined && !Number.isFinite(Date.parse(data.asOf))) return { error: "Invalid asOf timestamp" };
      const indexed = await readIndexedEntity(kv, data.entityName);
      if ("error" in indexed) return indexed;
      const { entity, relatedEdges, entityHistory, truncated } = indexed;
      const allEntityEdges = [...new Map([...entityHistory, ...relatedEdges].map(edge => [edge.id, edge])).values()];

      if (data.asOf) {
        const asOfTime = new Date(data.asOf).getTime();
        const validEdges = allEntityEdges.filter((e) => {
          const commitTime = new Date(
            e.tcommit || e.createdAt,
          ).getTime();
          if (commitTime > asOfTime) return false;
          if (e.tvalid) {
            const validTime = new Date(e.tvalid).getTime();
            if (validTime > asOfTime) return false;
          }
          if (e.tvalidEnd) {
            const endTime = new Date(e.tvalidEnd).getTime();
            if (endTime < asOfTime) return false;
          }
          return true;
        });

        const currentEdges = getLatestByKey(validEdges);
        const historical = data.includeHistory ? validEdges : [];

        return {
          entity,
          truncated,
          currentEdges,
          historicalEdges: historical,
          timeline: buildTimeline(allEntityEdges),
        };
      }

      const currentEdges = relatedEdges.filter(
        (e) => e.isLatest !== false,
      );

      return {
        entity,
        truncated,
        currentEdges,
        historicalEdges: data.includeHistory ? allEntityEdges.filter(edge => edge.isLatest === false) : [],
        timeline: buildTimeline(allEntityEdges),
      };
    },
  );

  sdk.registerFunction("mem::differential-state", 
    async (data: {
      entityName: string;
      from?: string;
      to?: string;
    }) => {
      const kv = await pinGraphState(state);
      if ((data.from !== undefined && !Number.isFinite(Date.parse(data.from))) ||
          (data.to !== undefined && !Number.isFinite(Date.parse(data.to)))) return { error: "Invalid temporal range" };
      if (data.from && data.to && Date.parse(data.from) > Date.parse(data.to)) return { error: "Temporal range is reversed" };
      const indexed = await readIndexedEntity(kv, data.entityName, false);
      if ("error" in indexed) return indexed;
      const { entity, relatedEdges, entityHistory, truncated } = indexed;
      const allEntityEdges = [...new Map([...entityHistory, ...relatedEdges].map(edge => [edge.id, edge])).values()];

      allEntityEdges.sort(
        (a, b) =>
          new Date(a.tcommit || a.createdAt).getTime() -
          new Date(b.tcommit || b.createdAt).getTime(),
      );

      const fromTime = data.from
        ? new Date(data.from).getTime()
        : 0;
      const toTime = data.to
        ? new Date(data.to).getTime()
        : Date.now();

      const filtered = allEntityEdges.filter((e) => {
        const t = new Date(e.tcommit || e.createdAt).getTime();
        return t >= fromTime && t <= toTime;
      });

      const changes = filtered.map((e) => ({
        type: e.type,
        target:
          e.sourceNodeId === entity.id
            ? e.targetNodeId
            : e.sourceNodeId,
        validFrom: e.tvalid || e.createdAt,
        validTo: e.tvalidEnd,
        reasoning: e.context?.reasoning,
        sentiment: e.context?.sentiment,
        version: e.version || 1,
        isLatest: e.isLatest !== false,
      }));

      return {
        entity: entity.name,
        truncated,
        totalChanges: changes.length,
        changes,
      };
    },
  );
}

function getLatestByKey(edges: GraphEdge[]): GraphEdge[] {
  const byKey = new Map<string, GraphEdge>();
  for (const e of edges) {
    const key = `${e.sourceNodeId}|${e.targetNodeId}|${e.type}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      new Date(e.tcommit || e.createdAt).getTime() >
        new Date(existing.tcommit || existing.createdAt).getTime()
    ) {
      byKey.set(key, e);
    }
  }
  return Array.from(byKey.values());
}

function buildTimeline(
  edges: GraphEdge[],
): Array<{
  edge: GraphEdge;
  validFrom: string;
  validTo?: string;
  context?: EdgeContext;
}> {
  const sorted = [...edges].sort(
    (a, b) =>
      new Date(a.tcommit || a.createdAt).getTime() -
      new Date(b.tcommit || b.createdAt).getTime(),
  );

  return sorted.map((e) => ({
    edge: e,
    validFrom: e.tvalid || e.createdAt,
    validTo: e.tvalidEnd,
    context: e.context,
  }));
}

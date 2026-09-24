import type { ISdk } from "iii-sdk";
import type { GraphEdge, GraphNode, GraphSnapshot } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { logger } from "../logger.js";
import { edgeIndexKey, nameIndexKey, SNAPSHOT_KEY } from "./graph.js";
import { getGraphMaxSourceIds } from "../config.js";

// The knowledge graph had no GC. Every extraction appended nodes and
// edges, nothing ever removed them, and at 69K nodes / 185K edges the
// retrieval path (and mem::graph-snapshot-rebuild, whose safe ceiling
// is 25K nodes) had already gone past what a single kv.list can carry.
//
// This is the missing collector. It runs off its own enumeration
// rather than the search-path graph view, because the view
// deliberately excludes `stale` rows and those are the first thing
// worth collecting. Deletions route through StateKV, so the shared
// view is patched as they happen.
//
// Every class it removes is provably dead:
//   stale     — already tombstoned by cascade/mesh, kept only because
//               nothing swept them.
//   dangling  — an edge whose endpoint node no longer exists; it can
//               never be traversed.
//   superseded— a temporal edge explicitly marked isLatest:false and
//               older than the retention cutoff, i.e. history that has
//               already been replaced by a newer revision.
//
// Duplicate names are counted by the survey but not merged here: merging
// rewrites live rows rather than removing dead ones, and needs its own
// design for edge-key collisions and two-phase keeper writes.

const DEFAULT_SUPERSEDED_RETENTION_DAYS = 90;

export interface GraphPruneReport {
  success: true;
  dryRun: boolean;
  before: { nodes: number; edges: number };
  staleNodes: number;
  staleEdges: number;
  danglingEdges: number;
  supersededEdges: number;
  /** Reported by the survey only; merging duplicates is not part of this function. */
  duplicateNodes: number;
  oversizedNodes: number;
  oversizedEdges: number;
  droppableSourceIds: number;
  compactedNodes: number;
  compactedEdges: number;
  deletedNodes: number;
  deletedEdges: number;
  errors: number;
  ms: number;
}

function edgeTimestamp(edge: GraphEdge): number {
  const raw = edge.tcommit || edge.createdAt;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function registerGraphPruneFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::graph-prune",
    async (data?: {
      dryRun?: boolean;
      supersededOlderThanDays?: number;
      compactSourceIds?: boolean;
    }): Promise<GraphPruneReport> => {
      const started = Date.now();
      // Default to a dry run: this deletes graph rows, and the caller
      // should have to say so explicitly. The scheduled sweep passes
      // dryRun:false.
      const dryRun = data?.dryRun !== false;
      const retentionDays =
        typeof data?.supersededOlderThanDays === "number" &&
        data.supersededOlderThanDays >= 0
          ? data.supersededOlderThanDays
          : DEFAULT_SUPERSEDED_RETENTION_DAYS;
      const compactSources = data?.compactSourceIds === true;
      const maxSourceIds = getGraphMaxSourceIds();
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      // Sequential, matching the graph view build: two multi-megabyte
      // frames in flight at once doubles the parse cost on the worker
      // event loop.
      const allNodes = await kv.list<GraphNode>(KV.graphNodes);
      const allEdges = await kv.list<GraphEdge>(KV.graphEdges);

      const report: GraphPruneReport = {
        success: true,
        dryRun,
        before: { nodes: allNodes.length, edges: allEdges.length },
        staleNodes: 0,
        staleEdges: 0,
        danglingEdges: 0,
        supersededEdges: 0,
        duplicateNodes: 0,
        oversizedNodes: 0,
        oversizedEdges: 0,
        droppableSourceIds: 0,
        compactedNodes: 0,
        compactedEdges: 0,
        deletedNodes: 0,
        deletedEdges: 0,
        errors: 0,
        ms: 0,
      };

      const liveNodes = new Map<string, GraphNode>();
      const nodesToDelete = new Map<string, GraphNode>();
      for (const node of allNodes) {
        if (!node?.id) continue;
        if (node.stale) {
          report.staleNodes++;
          nodesToDelete.set(node.id, node);
        } else {
          liveNodes.set(node.id, node);
        }
      }

      const edgesToDelete = new Map<string, GraphEdge>();
      const markEdge = (edge: GraphEdge): void => {
        if (!edgesToDelete.has(edge.id)) edgesToDelete.set(edge.id, edge);
      };
      for (const edge of allEdges) {
        if (!edge?.id) continue;
        if (edge.stale) {
          report.staleEdges++;
          markEdge(edge);
          continue;
        }
        if (
          !liveNodes.has(edge.sourceNodeId) ||
          !liveNodes.has(edge.targetNodeId)
        ) {
          report.danglingEdges++;
          markEdge(edge);
          continue;
        }
        if (edge.isLatest === false && edgeTimestamp(edge) < cutoff) {
          report.supersededEdges++;
          markEdge(edge);
        }
      }

      // Duplicate detection always runs so the dry-run report shows
      // what merging would recover; the rewrite itself is opt-in.
      const byName = new Map<string, GraphNode[]>();
      for (const node of liveNodes.values()) {
        const key = nameIndexKey(node.type, node.name);
        const group = byName.get(key);
        if (group) group.push(node);
        else byName.set(key, [node]);
      }
      const duplicateGroups: GraphNode[][] = [];
      for (const group of byName.values()) {
        if (group.length < 2) continue;
        // Oldest row wins: it is the one the name index and existing
        // edges are most likely already pointing at.
        group.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        duplicateGroups.push(group);
        report.duplicateNodes += group.length - 1;
      }

      // Provenance survey. Counted for every live row so the dry run
      // reports what compaction would recover before anything is written.
      const oversizedNodeRows: GraphNode[] = [];
      for (const node of liveNodes.values()) {
        const extra = (node.sourceObservationIds?.length ?? 0) - maxSourceIds;
        if (extra > 0) {
          report.oversizedNodes++;
          report.droppableSourceIds += extra;
          oversizedNodeRows.push(node);
        }
      }
      const oversizedEdgeRows: GraphEdge[] = [];
      for (const edge of allEdges) {
        if (!edge?.id || edgesToDelete.has(edge.id)) continue;
        const extra = (edge.sourceObservationIds?.length ?? 0) - maxSourceIds;
        if (extra > 0) {
          report.oversizedEdges++;
          report.droppableSourceIds += extra;
          oversizedEdgeRows.push(edge);
        }
      }

      if (dryRun) {
        report.ms = Date.now() - started;
        logger.info("Graph prune (dry run)", { ...report });
        return report;
      }

      // ---- compact provenance ----------------------------------------------
      // Keeps the newest ids, matching the cap the merge path now applies
      // at write time. Nothing else on the row is touched.
      const compactedNodeRows: GraphNode[] = [];
      const compactedEdgeRows: GraphEdge[] = [];
      if (compactSources) {
        for (const node of oversizedNodeRows) {
          if (nodesToDelete.has(node.id)) continue;
          try {
            const trimmed = node.sourceObservationIds.slice(-maxSourceIds);
            const compacted = { ...node, sourceObservationIds: trimmed };
            await kv.set(KV.graphNodes, node.id, compacted);
            liveNodes.set(node.id, compacted);
            compactedNodeRows.push(compacted);
            report.compactedNodes++;
          } catch (err) {
            report.errors++;
            logger.warn("Graph prune node compaction failed", {
              nodeId: node.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        for (const edge of oversizedEdgeRows) {
          if (edgesToDelete.has(edge.id)) continue;
          try {
            const compacted = {
              ...edge,
              sourceObservationIds: edge.sourceObservationIds.slice(-maxSourceIds),
            };
            await kv.set(KV.graphEdges, edge.id, compacted);
            compactedEdgeRows.push(compacted);
            report.compactedEdges++;
          } catch (err) {
            report.errors++;
            logger.warn("Graph prune edge compaction failed", {
              edgeId: edge.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // ---- delete ----------------------------------------------------------
      // Edges first: deleting a node before its edges would turn those
      // edges into dangling rows if the run is interrupted.
      // Reconcile the snapshot against rows that were really removed. A
      // failed delete left in the candidate map would otherwise drop a row
      // that is still persisted out of snapshot-backed queries.
      const deletedNodeIds = new Set<string>();
      const deletedEdgeIds = new Set<string>();

      for (const edge of edgesToDelete.values()) {
        try {
          await kv.delete(KV.graphEdges, edge.id);
          const key = edgeIndexKey(edge.sourceNodeId, edge.targetNodeId, edge.type);
          const indexed = await kv.get<string>(KV.graphEdgeKey, key).catch(() => null);
          // Only clear the index entry if it still points at this edge;
          // a newer edge may have claimed the same endpoint triple.
          if (indexed === edge.id) await kv.delete(KV.graphEdgeKey, key);
          deletedEdgeIds.add(edge.id);
          report.deletedEdges++;
        } catch (err) {
          report.errors++;
          logger.warn("Graph prune edge delete failed", {
            edgeId: edge.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      for (const node of nodesToDelete.values()) {
        try {
          await kv.delete(KV.graphNodes, node.id);
          await kv.delete(KV.graphNodeDegree, node.id).catch(() => {});
          const key = nameIndexKey(node.type, node.name);
          const indexed = await kv.get<string>(KV.graphNameIndex, key).catch(() => null);
          if (indexed === node.id) await kv.delete(KV.graphNameIndex, key);
          deletedNodeIds.add(node.id);
          report.deletedNodes++;
        } catch (err) {
          report.errors++;
          logger.warn("Graph prune node delete failed", {
            nodeId: node.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Keep the precomputed snapshot honest. Its per-type breakdown
      // will drift, so flag it dirty; the totals are corrected here
      // because /graph/stats reports them directly.
      if (
        report.deletedNodes > 0 ||
        report.deletedEdges > 0 ||
        report.compactedNodes > 0 ||
        report.compactedEdges > 0
      ) {
        try {
          const snap = await kv.get<GraphSnapshot>(KV.graphSnapshot, SNAPSHOT_KEY);
          if (snap) {
            // The snapshot serves /graph/query on the no-argument path, so a
            // compacted row has to be reflected here too. Otherwise the run
            // reports success while queries keep returning the provenance it
            // just trimmed.
            const compactedNodeIds = new Map(
              compactedNodeRows.map((n) => [n.id, n.sourceObservationIds]),
            );
            const compactedEdgeIds = new Map(
              compactedEdgeRows.map((e) => [e.id, e.sourceObservationIds]),
            );
            await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, {
              ...snap,
              topNodes: (snap.topNodes ?? [])
                .filter((n) => !deletedNodeIds.has(n.id))
                .map((n) =>
                  compactedNodeIds.has(n.id)
                    ? { ...n, sourceObservationIds: compactedNodeIds.get(n.id)! }
                    : n,
                ),
              topEdges: (snap.topEdges ?? [])
                .filter((e) => !deletedEdgeIds.has(e.id))
                .map((e) =>
                  compactedEdgeIds.has(e.id)
                    ? { ...e, sourceObservationIds: compactedEdgeIds.get(e.id)! }
                    : e,
                ),
              stats: {
                ...snap.stats,
                totalNodes: Math.max(0, snap.stats.totalNodes - report.deletedNodes),
                totalEdges: Math.max(0, snap.stats.totalEdges - report.deletedEdges),
              },
              dirty: true,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          report.errors++;
          logger.warn("Graph prune snapshot update failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      report.ms = Date.now() - started;
      logger.info("Graph prune complete", { ...report });
      return report;
    },
  );
}

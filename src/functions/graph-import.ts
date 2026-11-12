import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { confinePath } from "./path-guard.js";
import type { IIIClient } from "iii-sdk";
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType } from "../types.js";
import { generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { pinGraphState } from "../state/graph-generation.js";
import { persistGraphDelta } from "./graph.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";
import { getGraphImportMaxEdges, getGraphImportMaxNodes } from "../config.js";
import { getGraphIndexMigrationStatus } from "../state/graph-index-migration.js";

// Import graphify's structural knowledge graph (graphify-out/graph.json) into
// the memory graph, so context injection and graph retrieval see codebase
// structure the developer never touched in a session. graphify's extraction is
// deterministic AST analysis; ours is session-derived. The two meet here.
//
// Idempotency comes from persistGraphDelta's (type, name) name-index upsert:
// re-importing after `graphify update .` merges into existing nodes instead of
// duplicating. Provenance is kept on properties.source so imported structure
// is distinguishable from session-derived entities.

// Bounds protect the KV store and the iii invocation budget from very large
// graphs (graphify caps graph.json at 512MiB; a 100k-node import would blow
// the invocation window). Truncation is reported loudly in the result.
const MAX_FILE_BYTES = 32 * 1024 * 1024;

// graphify file_type enum: code|document|paper|image|rationale|concept.
// Mapped to the closest memory-graph node type; code symbols carrying a file
// extension in the label are files, the rest are treated as functions.
function mapNodeType(fileType: unknown, label: string): GraphNodeType {
  switch (fileType) {
    case "rationale":
      return "decision";
    case "document":
    case "paper":
    case "image":
    case "concept":
      return "concept";
    case "code":
      return /\.[a-z0-9]{1,10}$/i.test(label) ? "file" : "function";
    default:
      return /\.[a-z0-9]{1,10}$/i.test(label) ? "file" : "concept";
  }
}

// graphify relations observed in its extractors: calls, imports, uses,
// requires, inherits, references, source. Anything unrecognized stays a
// generic related_to edge rather than being dropped.
function mapEdgeType(relation: unknown): GraphEdgeType {
  switch (relation) {
    case "imports":
    case "source":
      return "imports";
    case "calls":
    case "uses":
      return "uses";
    case "requires":
    case "inherits":
    case "depends_on":
      return "depends_on";
    default:
      return "related_to";
  }
}

// graphify edge confidence tags: EXTRACTED (deterministic AST) beats
// INFERRED (heuristic) beats AMBIGUOUS.
function mapConfidence(confidence: unknown): number {
  switch (confidence) {
    case "EXTRACTED":
      return 0.9;
    case "INFERRED":
      return 0.6;
    case "AMBIGUOUS":
      return 0.3;
    default:
      return 0.5;
  }
}

type RawGraph = {
  nodes?: unknown;
  links?: unknown;
  edges?: unknown;
};

export type GraphifyImportResult = {
  success: boolean;
  error?: string;
  path?: string;
  nodesRead?: number;
  edgesRead?: number;
  nodesImported?: number;
  edgesImported?: number;
  newNodes?: number;
  newEdges?: number;
  mergedNodes?: number;
  mergedEdges?: number;
  skippedEdges?: number;
  truncated?: boolean;
  limits?: { nodes: number; edges: number };
  droppedNodes?: number;
  droppedEdges?: number;
  graphIndex?: { state: string; ready: boolean; action?: string };
  warnings?: string[];
};

export type GraphifyImportLimits = { maxNodes: number; maxEdges: number };

export function parseGraphifyGraph(
  raw: string,
  limits: GraphifyImportLimits = { maxNodes: getGraphImportMaxNodes(), maxEdges: getGraphImportMaxEdges() },
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodesRead: number;
  edgesRead: number;
  skippedEdges: number;
  droppedNodes: number;
  droppedEdges: number;
} {
  const { maxNodes, maxEdges } = limits;
  const parsed = JSON.parse(raw) as RawGraph;
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  // graphify's clustered output stores edges under "links" (NetworkX
  // node_link); --no-cluster graphs store them under "edges". Accept both.
  const rawEdges = Array.isArray(parsed.links)
    ? parsed.links
    : Array.isArray(parsed.edges)
      ? parsed.edges
      : [];

  const now = new Date().toISOString();
  const droppedNodes = Math.max(0, rawNodes.length - maxNodes);
  let droppedEdges = Math.max(0, rawEdges.length - maxEdges);
  const droppedIds = new Set<string>();
  for (const entry of rawNodes.slice(maxNodes)) {
    const id = entry && typeof entry === "object" ? (entry as Record<string, unknown>).id : undefined;
    if (typeof id === "string" || typeof id === "number") droppedIds.add(String(id));
  }

  const nodes: GraphNode[] = [];
  const byGraphifyId = new Map<string, GraphNode>();
  for (const entry of rawNodes.slice(0, maxNodes)) {
    if (!entry || typeof entry !== "object") continue;
    const n = entry as Record<string, unknown>;
    const graphifyId = typeof n.id === "string" || typeof n.id === "number" ? String(n.id) : null;
    const label =
      typeof n.label === "string" && n.label.trim()
        ? n.label.trim()
        : graphifyId;
    if (!graphifyId || !label) continue;

    const properties: Record<string, unknown> = { source: "graphify" };
    if (typeof n.source_file === "string") properties.sourceFile = n.source_file;
    if (n.community !== undefined) properties.community = n.community;
    if (typeof n.file_type === "string") properties.fileType = n.file_type;

    const node: GraphNode = {
      id: generateId("gn"),
      type: mapNodeType(n.file_type, label),
      name: label,
      properties,
      sourceObservationIds: [],
      createdAt: now,
    };
    nodes.push(node);
    byGraphifyId.set(graphifyId, node);
  }

  const edges: GraphEdge[] = [];
  let skippedEdges = 0;
  for (const entry of rawEdges.slice(0, maxEdges)) {
    if (!entry || typeof entry !== "object") {
      skippedEdges++;
      continue;
    }
    const e = entry as Record<string, unknown>;
    const source = e.source !== undefined ? String(e.source) : null;
    const target = e.target !== undefined ? String(e.target) : null;
    const sourceNode = source ? byGraphifyId.get(source) : undefined;
    const targetNode = target ? byGraphifyId.get(target) : undefined;
    if (!sourceNode || !targetNode) {
      // Endpoint outside the imported node set (dropped by the cap, or a
      // dangling reference in the file). Skipped, counted, never guessed.
      if ((source && droppedIds.has(source)) || (target && droppedIds.has(target))) droppedEdges++;
      else skippedEdges++;
      continue;
    }
    edges.push({
      id: generateId("ge"),
      type: mapEdgeType(e.relation ?? e.type),
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      weight: mapConfidence(e.confidence),
      sourceObservationIds: [],
      createdAt: now,
    });
  }

  return {
    nodes,
    edges,
    nodesRead: rawNodes.length,
    edgesRead: rawEdges.length,
    skippedEdges,
    droppedNodes,
    droppedEdges,
  };
}

export function registerGraphImportFunction(sdk: IIIClient, state: StateKV): void {
  sdk.registerFunction(
    "mem::graph::import-graphify",
    async (data?: { path?: string; cwd?: string }): Promise<GraphifyImportResult> => {
      const kv = await pinGraphState(state);
      const explicitPath = typeof data?.path === "string" ? data.path : undefined;
      const cwd = typeof data?.cwd === "string" ? data.cwd : process.cwd();
      const requested = explicitPath ?? join(cwd, "graphify-out", "graph.json");
      if (!requested.toLowerCase().endsWith(".json")) {
        return { success: false, error: "path must point to a .json file", path: requested };
      }
      const confined = await confinePath(requested);
      if (!confined.ok) {
        return { success: false, error: confined.error, path: requested };
      }
      const path = confined.path;

      try {
        let size: number;
        try {
          size = (await stat(path)).size;
        } catch {
          return {
            success: false,
            error: `graph.json not found at ${path}. Run graphify first, or pass an explicit path.`,
            path,
          };
        }
        if (size > MAX_FILE_BYTES) {
          return {
            success: false,
            error: `graph.json is ${Math.round(size / 1024 / 1024)}MB, over the ${MAX_FILE_BYTES / 1024 / 1024}MB import cap.`,
            path,
          };
        }

        const limits = { nodes: getGraphImportMaxNodes(), edges: getGraphImportMaxEdges() };
        const parsed = parseGraphifyGraph(await readFile(path, "utf-8"), {
          maxNodes: limits.nodes,
          maxEdges: limits.edges,
        });
        const { newNodeCount, newEdgeCount } = await persistGraphDelta(
          kv,
          parsed.nodes,
          parsed.edges,
        );
        const truncated = parsed.droppedNodes > 0 || parsed.droppedEdges > 0;

        await recordAudit(kv, "import", "mem::graph::import-graphify", [], {
          path,
          nodesImported: parsed.nodes.length,
          edgesImported: parsed.edges.length,
          newNodes: newNodeCount,
          newEdges: newEdgeCount,
          droppedNodes: parsed.droppedNodes,
          droppedEdges: parsed.droppedEdges,
        });

        const warnings: string[] = [];
        if (truncated) {
          const message = `Import truncated: dropped ${parsed.droppedNodes} of ${parsed.nodesRead} nodes and ${parsed.droppedEdges} of ${parsed.edgesRead} edges over the limits (${limits.nodes} nodes, ${limits.edges} edges). Raise AGENTMEMORY_GRAPH_IMPORT_MAX_NODES or AGENTMEMORY_GRAPH_IMPORT_MAX_EDGES and import again.`;
          warnings.push(message);
          logger.warn("graphify import truncated", {
            path,
            nodesRead: parsed.nodesRead,
            edgesRead: parsed.edgesRead,
            droppedNodes: parsed.droppedNodes,
            droppedEdges: parsed.droppedEdges,
            limits,
          });
        }

        const index = await getGraphIndexMigrationStatus(state);
        const graphIndex = {
          state: index.state,
          ready: index.ready,
          ...(index.action ? { action: index.action } : {}),
        };
        if (!index.ready) {
          warnings.push(
            `Imported records are stored, but the graph index is not ready (${index.state}), so the viewer and graph queries cannot show them yet. ${index.action ?? "Run agentmemory graph-index status."}`,
          );
          logger.warn("graphify import stored but graph index is not ready", {
            path,
            graphIndex: index.state,
          });
        }

        logger.info("graphify graph imported", {
          path,
          nodes: parsed.nodes.length,
          edges: parsed.edges.length,
          newNodes: newNodeCount,
          newEdges: newEdgeCount,
        });

        return {
          success: true,
          path,
          nodesRead: parsed.nodesRead,
          edgesRead: parsed.edgesRead,
          nodesImported: parsed.nodes.length,
          edgesImported: parsed.edges.length,
          newNodes: newNodeCount,
          newEdges: newEdgeCount,
          mergedNodes: parsed.nodes.length - newNodeCount,
          mergedEdges: parsed.edges.length - newEdgeCount,
          skippedEdges: parsed.skippedEdges,
          truncated,
          limits,
          droppedNodes: parsed.droppedNodes,
          droppedEdges: parsed.droppedEdges,
          graphIndex,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("graphify import failed", { path, error: msg });
        return { success: false, error: msg, path };
      }
    },
  );
}

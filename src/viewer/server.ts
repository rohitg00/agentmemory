import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ISdk } from "iii-sdk";
import type {
  Session,
  Memory,
  CompressedObservation,
  SessionSummary,
  MemoryRelation,
  SemanticMemory,
  ProceduralMemory,
  GraphNode,
  GraphEdge,
  RawObservation,
} from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { getLatestHealth } from "../health/monitor.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import type { ResilientProvider } from "../providers/resilient.js";
import { timingSafeCompare, VIEWER_CSP } from "../auth.js";

const ALLOWED_ORIGINS = (
  process.env.VIEWER_ALLOWED_ORIGINS ||
  "http://localhost:3111,http://localhost:3113,http://127.0.0.1:3111,http://127.0.0.1:3113"
)
  .split(",")
  .map((o) => o.trim());

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function json(
  res: ServerResponse,
  status: number,
  data: unknown,
  req?: IncomingMessage,
): void {
  const body = JSON.stringify(data);
  const cors = req
    ? corsHeaders(req)
    : { "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0], Vary: "Origin" };
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        req.destroy();
        reject(new Error("too large"));
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function checkAuth(req: IncomingMessage, secret: string | undefined): boolean {
  if (!secret) return true;
  const auth = req.headers["authorization"] || "";
  return (
    typeof auth === "string" && timingSafeCompare(auth, `Bearer ${secret}`)
  );
}

function gid(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 14);
  return `${prefix}_${ts}_${rand}`;
}

async function buildGraphFromData(kv: StateKV): Promise<{
  success: boolean;
  nodes: number;
  edges: number;
}> {
  const sessions = await kv.list<Session>(KV.sessions);
  const memories = await kv.list<Memory>(KV.memories);
  const now = new Date().toISOString();

  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  function ensureNode(
    name: string,
    type: GraphNode["type"],
    obsIds: string[] = [],
  ): GraphNode {
    const key = `${type}:${name}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: gid("gn"),
        type,
        name,
        properties: {},
        sourceObservationIds: obsIds,
        createdAt: now,
      });
    }
    return nodeMap.get(key)!;
  }

  for (const sess of sessions) {
    const obs = await kv
      .list<CompressedObservation & RawObservation>(KV.observations(sess.id))
      .catch(() => []);

    const projectNode = ensureNode(
      sess.project || sess.cwd || sess.id,
      "concept",
    );

    for (const o of obs) {
      const toolName = o.toolName;
      const input = o.toolInput as Record<string, unknown> | undefined;

      if (toolName) {
        const toolNode = ensureNode(toolName, "function", [o.id]);
        edges.push({
          id: gid("ge"),
          type: "uses",
          sourceNodeId: projectNode.id,
          targetNodeId: toolNode.id,
          weight: 1,
          sourceObservationIds: [o.id],
          createdAt: now,
        });

        if (input) {
          const fp =
            (input.file_path as string) ||
            (input.path as string) ||
            (input.pattern as string);
          if (fp) {
            const fileNode = ensureNode(fp, "file", [o.id]);
            edges.push({
              id: gid("ge"),
              type: "modifies",
              sourceNodeId: toolNode.id,
              targetNodeId: fileNode.id,
              weight: 1,
              sourceObservationIds: [o.id],
              createdAt: now,
            });
          }
          const query =
            (input.query as string) || (input.description as string);
          if (query) {
            const conceptNode = ensureNode(
              query.length > 40 ? query.slice(0, 40) + "..." : query,
              "concept",
              [o.id],
            );
            edges.push({
              id: gid("ge"),
              type: "related_to",
              sourceNodeId: toolNode.id,
              targetNodeId: conceptNode.id,
              weight: 0.8,
              sourceObservationIds: [o.id],
              createdAt: now,
            });
          }
        }
      }

      if (o.concepts) {
        for (const c of o.concepts) {
          ensureNode(c, "concept", [o.id]);
        }
      }
      if (o.files) {
        for (const f of o.files) {
          ensureNode(f, "file", [o.id]);
        }
      }
    }
  }

  for (const mem of memories) {
    const memNode = ensureNode(
      mem.content.length > 50 ? mem.content.slice(0, 50) + "..." : mem.content,
      mem.type === "architecture"
        ? "pattern"
        : mem.type === "fact"
          ? "concept"
          : "decision",
      [],
    );
    const ids = (memNode.properties.memoryIds as string[]) || [];
    ids.push(mem.id);
    memNode.properties.memoryIds = ids;
    const types = (memNode.properties.memoryTypes as string[]) || [];
    if (!types.includes(mem.type)) types.push(mem.type);
    memNode.properties.memoryTypes = types;

    if (mem.concepts) {
      for (const c of mem.concepts) {
        const cNode = ensureNode(c, "concept");
        edges.push({
          id: gid("ge"),
          type: "related_to",
          sourceNodeId: memNode.id,
          targetNodeId: cNode.id,
          weight: 0.7,
          sourceObservationIds: [],
          createdAt: now,
        });
      }
    }
  }

  const fileNodes = [...nodeMap.values()].filter((n) => n.type === "file");
  const funcNodes = [...nodeMap.values()].filter((n) => n.type === "function");
  for (const fn of funcNodes) {
    for (const file of fileNodes) {
      const hasEdge = edges.some(
        (e) =>
          (e.sourceNodeId === fn.id && e.targetNodeId === file.id) ||
          (e.sourceNodeId === file.id && e.targetNodeId === fn.id),
      );
      if (!hasEdge) continue;
      for (const fn2 of funcNodes) {
        if (fn2.id === fn.id) continue;
        const alsoTouches = edges.some(
          (e) =>
            (e.sourceNodeId === fn2.id && e.targetNodeId === file.id) ||
            (e.sourceNodeId === file.id && e.targetNodeId === fn2.id),
        );
        if (alsoTouches) {
          const exists = edges.some(
            (e) =>
              (e.sourceNodeId === fn.id && e.targetNodeId === fn2.id) ||
              (e.sourceNodeId === fn2.id && e.targetNodeId === fn.id),
          );
          if (!exists) {
            edges.push({
              id: gid("ge"),
              type: "related_to",
              sourceNodeId: fn.id,
              targetNodeId: fn2.id,
              weight: 0.5,
              sourceObservationIds: [],
              createdAt: now,
            });
          }
        }
      }
    }
  }

  const oldNodes = await kv.list<GraphNode>(KV.graphNodes).catch(() => []);
  for (const old of oldNodes) {
    await kv.delete(KV.graphNodes, old.id);
  }
  const oldEdges = await kv.list<GraphEdge>(KV.graphEdges).catch(() => []);
  for (const old of oldEdges) {
    await kv.delete(KV.graphEdges, old.id);
  }

  const nodes = [...nodeMap.values()];
  for (const n of nodes) {
    await kv.set(KV.graphNodes, n.id, n);
  }
  for (const e of edges) {
    await kv.set(KV.graphEdges, e.id, e);
  }

  return { success: true, nodes: nodes.length, edges: edges.length };
}

async function buildProfileFromRawObs(
  kv: StateKV,
  project: string,
): Promise<Record<string, unknown>> {
  const sessions = await kv.list<Session>(KV.sessions);
  const projSessions = sessions.filter(
    (s) => s.project === project || s.cwd === project,
  );

  const fileCounts: Record<string, number> = {};
  const conceptCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};
  const conventions: string[] = [];
  let totalObs = 0;

  for (const sess of projSessions) {
    const obs = await kv
      .list<CompressedObservation & RawObservation>(KV.observations(sess.id))
      .catch(() => []);
    totalObs += obs.length;

    for (const o of obs) {
      if (o.toolName)
        toolCounts[o.toolName] = (toolCounts[o.toolName] || 0) + 1;
      if (o.concepts) {
        for (const c of o.concepts)
          conceptCounts[c] = (conceptCounts[c] || 0) + 1;
      }
      if (o.files) {
        for (const f of o.files) fileCounts[f] = (fileCounts[f] || 0) + 1;
      }
      const input = o.toolInput as Record<string, unknown> | undefined;
      if (input) {
        const fp =
          (input.file_path as string) ||
          (input.path as string) ||
          (input.pattern as string);
        if (fp) fileCounts[fp] = (fileCounts[fp] || 0) + 1;
      }
    }
  }

  const toolList = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  if (toolList.length > 0) {
    conventions.push(
      `Most used tools: ${toolList
        .slice(0, 5)
        .map(([t, c]) => `${t} (${c}x)`)
        .join(", ")}`,
    );
  }
  if (projSessions.length > 0) {
    const active = projSessions.filter((s) => s.status === "active").length;
    conventions.push(
      `${projSessions.length} sessions (${active} active), ${totalObs} total observations`,
    );
  }

  const topConcepts = Object.entries(conceptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([concept, frequency]) => ({ concept, frequency }));

  const topFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, frequency]) => ({ file, frequency }));

  if (topConcepts.length === 0) {
    for (const [tool, count] of toolList.slice(0, 8)) {
      topConcepts.push({ concept: tool, frequency: count });
    }
  }

  return {
    project,
    sessionCount: projSessions.length,
    totalObservations: totalObs,
    topConcepts,
    topFiles,
    conventions,
    commonErrors: [],
    recentActivity: toolList.slice(0, 5).map(([tool, count]) => ({
      type: tool,
      count,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function startViewerServer(
  port: number,
  kv: StateKV,
  sdk: ISdk,
  secret?: string,
  metricsStore?: MetricsStore,
  provider?: ResilientProvider | { circuitState?: unknown },
): Server {
  const server = createServer(async (req, res) => {
    const raw = req.url || "/";
    const qIdx = raw.indexOf("?");
    const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
    const params = new URLSearchParams(qs);
    const method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        ...corsHeaders(req),
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (
      method === "GET" &&
      (pathname === "/" ||
        pathname === "/viewer" ||
        pathname === "/agentmemory/viewer")
    ) {
      const base = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        join(base, "..", "src", "viewer", "index.html"),
        join(base, "..", "viewer", "index.html"),
        join(base, "viewer", "index.html"),
      ];
      for (const p of candidates) {
        try {
          const html = readFileSync(p, "utf-8");
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": VIEWER_CSP,
            "Cache-Control": "no-cache",
          });
          res.end(html);
          return;
        } catch {}
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("viewer not found");
      return;
    }

    if (!checkAuth(req, secret)) {
      json(res, 401, { error: "unauthorized" }, req);
      return;
    }

    try {
      await handleApiRoute(
        pathname,
        method,
        params,
        req,
        res,
        kv,
        sdk,
        metricsStore,
        provider,
      );
    } catch (err) {
      console.error(`[viewer] API error on ${method} ${pathname}:`, err);
      json(res, 500, { error: "internal error" }, req);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[agentmemory] Viewer: http://localhost:${port}`);
  });

  return server;
}

async function handleApiRoute(
  pathname: string,
  method: string,
  params: URLSearchParams,
  req: IncomingMessage,
  res: ServerResponse,
  kv: StateKV,
  sdk: ISdk,
  metricsStore?: MetricsStore,
  provider?: ResilientProvider | { circuitState?: unknown },
): Promise<void> {
  const path = pathname.replace(/^\/agentmemory\//, "");

  if (method === "GET" && path === "livez") {
    json(res, 200, { status: "ok", service: "agentmemory" }, req);
    return;
  }

  if (method === "GET" && path === "health") {
    try {
      const health = await getLatestHealth(kv);
      const functionMetrics = metricsStore ? await metricsStore.getAll() : [];
      const circuitBreaker =
        provider && "circuitState" in provider ? provider.circuitState : null;
      const status = health?.status || "healthy";
      json(
        res,
        status === "critical" ? 503 : 200,
        {
          status,
          service: "agentmemory",
          version: "0.4.0",
          health: health || null,
          functionMetrics,
          circuitBreaker,
        },
        req,
      );
    } catch {
      json(
        res,
        200,
        {
          status: "healthy",
          service: "agentmemory",
          version: "0.4.0",
          health: null,
          functionMetrics: [],
          circuitBreaker: null,
        },
        req,
      );
    }
    return;
  }

  if (method === "GET" && path === "sessions") {
    try {
      const sessions = await kv.list<Session>(KV.sessions);
      json(res, 200, { sessions }, req);
    } catch {
      json(res, 200, { sessions: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "memories") {
    try {
      const memories = await kv.list<Memory>(KV.memories);
      const latest = params.get("latest") === "true";
      json(
        res,
        200,
        { memories: latest ? memories.filter((m) => m.isLatest) : memories },
        req,
      );
    } catch {
      json(res, 200, { memories: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "observations") {
    const sessionId = params.get("sessionId");
    if (!sessionId) {
      json(res, 400, { error: "sessionId required" }, req);
      return;
    }
    try {
      const observations = await kv.list<CompressedObservation>(
        KV.observations(sessionId),
      );
      json(res, 200, { observations }, req);
    } catch {
      json(res, 200, { observations: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "graph/stats") {
    try {
      const result = await sdk.trigger("mem::graph-stats", {});
      json(res, 200, result, req);
    } catch {
      try {
        const nodes = await kv.list<GraphNode>(KV.graphNodes);
        const edges = await kv.list<GraphEdge>(KV.graphEdges);
        const types: Record<string, number> = {};
        for (const n of nodes) types[n.type] = (types[n.type] || 0) + 1;
        json(
          res,
          200,
          { nodes: nodes.length, edges: edges.length, types },
          req,
        );
      } catch {
        json(res, 200, { nodes: 0, edges: 0, types: {} }, req);
      }
    }
    return;
  }

  if (method === "GET" && path === "audit") {
    try {
      const result = await sdk.trigger("mem::audit-query", {
        operation: params.get("operation") || undefined,
        limit: parseInt(params.get("limit") || "50"),
      });
      const entries = Array.isArray(result)
        ? result
        : (result as Record<string, unknown>).entries || [];
      json(res, 200, { entries }, req);
    } catch {
      json(res, 200, { entries: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "profile") {
    const project = params.get("project");
    if (!project) {
      json(res, 400, { error: "project required" }, req);
      return;
    }
    try {
      const result = (await sdk.trigger("mem::profile", { project })) as {
        profile?: Record<string, unknown>;
      };
      const prof = result?.profile as Record<string, unknown> | undefined;
      const hasData =
        prof &&
        ((Array.isArray(prof.topConcepts) && prof.topConcepts.length > 0) ||
          (Array.isArray(prof.topFiles) && prof.topFiles.length > 0));
      if (hasData) {
        json(res, 200, result, req);
        return;
      }
      const enriched = await buildProfileFromRawObs(kv, project);
      json(res, 200, { profile: { ...prof, ...enriched }, cached: false }, req);
    } catch {
      try {
        const enriched = await buildProfileFromRawObs(kv, project);
        json(res, 200, { profile: enriched, cached: false }, req);
      } catch {
        json(res, 200, {}, req);
      }
    }
    return;
  }

  if (method === "GET" && path === "summaries") {
    try {
      const summaries = await kv.list<SessionSummary>(KV.summaries);
      json(res, 200, { summaries }, req);
    } catch {
      json(res, 200, { summaries: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "relations") {
    try {
      const relations = await kv.list<MemoryRelation>(KV.relations);
      json(res, 200, { relations }, req);
    } catch {
      json(res, 200, { relations: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "semantic") {
    try {
      const memories = await kv.list<SemanticMemory>(KV.semantic);
      json(res, 200, { memories }, req);
    } catch {
      json(res, 200, { memories: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "procedural") {
    try {
      const memories = await kv.list<ProceduralMemory>(KV.procedural);
      json(res, 200, { memories }, req);
    } catch {
      json(res, 200, { memories: [] }, req);
    }
    return;
  }

  if (method === "GET" && path === "function-metrics") {
    try {
      const metrics = metricsStore ? await metricsStore.getAll() : [];
      json(res, 200, { metrics }, req);
    } catch {
      json(res, 200, { metrics: [] }, req);
    }
    return;
  }

  if (method === "POST") {
    const ct = req.headers["content-type"] || "";
    if (ct && !ct.includes("application/json")) {
      json(res, 415, { error: "Content-Type must be application/json" }, req);
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: "invalid JSON" }, req);
      return;
    }

    if (path === "search") {
      try {
        const result = await sdk.trigger("mem::search", body);
        json(res, 200, result, req);
      } catch {
        json(res, 200, { results: [] }, req);
      }
      return;
    }

    if (path === "graph/query") {
      try {
        const result = await sdk.trigger("mem::graph-query", body);
        json(res, 200, result, req);
      } catch {
        try {
          const allNodes = await kv.list<GraphNode>(KV.graphNodes);
          const allEdges = await kv.list<GraphEdge>(KV.graphEdges);
          const startId = body.startNodeId as string | undefined;
          if (startId) {
            const connected = new Set<string>([startId]);
            for (const e of allEdges) {
              if (e.sourceNodeId === startId) connected.add(e.targetNodeId);
              if (e.targetNodeId === startId) connected.add(e.sourceNodeId);
            }
            json(
              res,
              200,
              {
                nodes: allNodes.filter((n) => connected.has(n.id)),
                edges: allEdges.filter(
                  (e) =>
                    connected.has(e.sourceNodeId) &&
                    connected.has(e.targetNodeId),
                ),
                depth: 1,
              },
              req,
            );
          } else {
            json(res, 200, { nodes: allNodes, edges: allEdges, depth: 0 }, req);
          }
        } catch {
          json(res, 200, { nodes: [], edges: [], depth: 0 }, req);
        }
      }
      return;
    }

    if (path === "graph/build") {
      try {
        const result = await buildGraphFromData(kv);
        json(res, 200, result, req);
      } catch {
        json(res, 200, { success: false, nodes: 0, edges: 0 }, req);
      }
      return;
    }

    if (path === "session/end") {
      if (typeof body.sessionId !== "string" || !body.sessionId) {
        json(res, 400, { success: false, error: "invalid sessionId" }, req);
        return;
      }
      try {
        const session = await kv.get<Session>(KV.sessions, body.sessionId);
        if (session) {
          await kv.set(KV.sessions, body.sessionId, {
            ...session,
            endedAt: new Date().toISOString(),
            status: "completed",
          });
        }
        json(res, 200, { success: true }, req);
      } catch {
        json(res, 200, { success: false }, req);
      }
      return;
    }

    if (path === "summarize") {
      try {
        const result = await sdk.trigger("mem::summarize", body);
        json(res, 200, result, req);
      } catch {
        json(res, 200, { error: "summarize unavailable" }, req);
      }
      return;
    }
  }

  if (method === "DELETE" && path === "governance/memories") {
    const ct = req.headers["content-type"] || "";
    if (ct && !ct.includes("application/json")) {
      json(res, 415, { error: "Content-Type must be application/json" }, req);
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: "invalid JSON" }, req);
      return;
    }
    try {
      const result = await sdk.trigger("mem::governance-delete", body);
      json(res, 200, result, req);
    } catch {
      json(res, 200, { success: false }, req);
    }
    return;
  }

  json(res, 404, { error: "not found" }, req);
}

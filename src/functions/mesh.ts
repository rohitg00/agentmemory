import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAudit } from "./audit.js";
import type {
  MeshPeer,
  Memory,
  Action,
  SemanticMemory,
  ProceduralMemory,
  MemoryRelation,
  GraphNode,
  GraphEdge,
} from "../types.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIP(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip === "169.254.169.254") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc00:") || ip.startsWith("fd")) return true;
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    return isPrivateIP(v4);
  }
  return false;
}

async function isAllowedUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();

    if (host === "localhost") return false;
    if (isIP(host) && isPrivateIP(host)) return false;

    if (!isIP(host)) {
      try {
        const resolved = await lookup(host, { all: true });
        if (resolved.some((r) => isPrivateIP(r.address))) return false;
      } catch {
        // DNS resolution failed — allow the URL (the actual fetch will fail if unreachable)
      }
    }

    return true;
  } catch {
    return false;
  }
}

const DEFAULT_SHARED_SCOPES = [
  "memories",
  "actions",
  "semantic",
  "procedural",
  "relations",
  "graph:nodes",
  "graph:edges",
];

interface MeshSyncPayload {
  memories?: Memory[];
  actions?: Action[];
  semantic?: SemanticMemory[];
  procedural?: ProceduralMemory[];
  relations?: MemoryRelation[];
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
}

type ProjectFilter =
  | { scoped: false; project?: undefined }
  | { scoped: true; project?: string };

function normalizeProjectFilter(project?: string): ProjectFilter {
  if (project === undefined) return { scoped: false };
  const trimmed = project.trim();
  return trimmed ? { scoped: true, project: trimmed } : { scoped: true };
}

function filterByProject<T extends { project?: string }>(
  items: T[],
  filter: ProjectFilter,
): T[] {
  if (!filter.scoped) return items;
  if (!filter.project) return [];
  return items.filter((item) => item.project === filter.project);
}

function filterPayloadByProject(
  data: MeshSyncPayload,
  filter: ProjectFilter,
): MeshSyncPayload {
  if (!filter.scoped) return data;
  return {
    ...data,
    memories: data.memories ? filterByProject(data.memories, filter) : undefined,
    actions: data.actions ? filterByProject(data.actions, filter) : undefined,
    semantic: undefined,
    procedural: undefined,
    relations: undefined,
    graphNodes: undefined,
    graphEdges: undefined,
  };
}

async function lwwMergeList<T extends { id: string }>(
  kv: StateKV,
  scope: string,
  items: T[] | undefined,
  lockPrefix: string,
  tsField: "updatedAt" | "createdAt",
): Promise<number> {
  if (!items || !Array.isArray(items)) return 0;
  let count = 0;
  for (const item of items) {
    if (!item.id || typeof item.id !== "string") continue;
    const ts = (item as Record<string, unknown>)[tsField];
    if (typeof ts !== "string" || Number.isNaN(new Date(ts).getTime())) continue;
    const wrote = await withKeyedLock(`${lockPrefix}:${item.id}`, async () => {
      const existing = await kv.get<T>(scope, item.id);
      if (!existing) {
        await kv.set(scope, item.id, item);
        return true;
      }
      const existingTs = (existing as Record<string, unknown>)[tsField] as string;
      if (new Date(ts) > new Date(existingTs)) {
        await kv.set(scope, item.id, item);
        return true;
      }
      return false;
    });
    if (wrote) count++;
  }
  return count;
}

function graphNodeTs(node: GraphNode): string {
  return node.updatedAt || node.createdAt;
}

async function lwwMergeGraphNodes(
  kv: StateKV,
  items: GraphNode[] | undefined,
): Promise<number> {
  if (!items || !Array.isArray(items)) return 0;
  let count = 0;
  for (const item of items) {
    if (!item.id || typeof item.id !== "string") continue;
    const ts = graphNodeTs(item);
    if (!ts || Number.isNaN(new Date(ts).getTime())) continue;
    const wrote = await withKeyedLock(`mem:gnode:${item.id}`, async () => {
      const existing = await kv.get<GraphNode>(KV.graphNodes, item.id);
      if (!existing) {
        await kv.set(KV.graphNodes, item.id, item);
        return true;
      }
      if (new Date(ts) > new Date(graphNodeTs(existing))) {
        await kv.set(KV.graphNodes, item.id, item);
        return true;
      }
      return false;
    });
    if (wrote) count++;
  }
  return count;
}

export function registerMeshFunction(
  sdk: ISdk,
  kv: StateKV,
  meshAuthToken?: string,
): void {
  sdk.registerFunction("mem::mesh-register",
    async (data: {
      url: string;
      name: string;
      sharedScopes?: string[];
      syncFilter?: { project?: string };
    }) => {
      if (!data || typeof data !== "object") {
        return { success: false, error: "payload required" };
      }
      if (!data.url || !data.name) {
        return { success: false, error: "url and name are required" };
      }

      if (!(await isAllowedUrl(data.url))) {
        return { success: false, error: "URL blocked: private/local address not allowed" };
      }

      const existing = await kv.list<MeshPeer>(KV.mesh);
      const duplicate = existing.find((p) => p.url === data.url);
      if (duplicate) {
        return { success: false, error: "peer already registered", peerId: duplicate.id };
      }

      const peer: MeshPeer = {
        id: generateId("peer"),
        url: data.url,
        name: data.name,
        status: "disconnected",
        sharedScopes: data.sharedScopes || DEFAULT_SHARED_SCOPES,
        syncFilter: data.syncFilter,
      };

      await kv.set(KV.mesh, peer.id, peer);
      await recordAudit(kv, "mesh_sync", "mem::mesh-register", [peer.id], {
        action: "mesh.register",
        peerId: peer.id,
        name: peer.name,
        url: peer.url,
        sharedScopes: peer.sharedScopes,
      });
      return { success: true, peer };
    },
  );

  sdk.registerFunction("mem::mesh-list", 
    async () => {
      const peers = await kv.list<MeshPeer>(KV.mesh);
      return { success: true, peers };
    },
  );

  sdk.registerFunction("mem::mesh-sync",
    async (data: { peerId?: string; scopes?: string[]; direction?: "push" | "pull" | "both" }) => {
      if (!meshAuthToken) {
        return {
          success: false,
          error: "mesh sync requires AGENTMEMORY_SECRET",
        };
      }
      if (!data || typeof data !== "object") {
        data = {};
      }

      const direction = data.direction || "both";
      let peers: MeshPeer[];

      if (data.peerId) {
        const peer = await kv.get<MeshPeer>(KV.mesh, data.peerId);
        if (!peer) return { success: false, error: "peer not found" };
        peers = [peer];
      } else {
        peers = await kv.list<MeshPeer>(KV.mesh);
      }

      const results: Array<{
        peerId: string;
        peerName: string;
        pushed: number;
        pulled: number;
        errors: string[];
      }> = [];

      for (const peer of peers) {
        const result = {
          peerId: peer.id,
          peerName: peer.name,
          pushed: 0,
          pulled: 0,
          errors: [] as string[],
        };

        peer.status = "syncing";
        await kv.set(KV.mesh, peer.id, peer);
        await recordAudit(kv, "mesh_sync", "mem::mesh-sync", [peer.id], {
          action: "mesh.sync.start",
          direction,
          scopes: data.scopes || peer.sharedScopes,
        });

        const scopes = data.scopes || peer.sharedScopes;
        const projectFilter = normalizeProjectFilter(peer.syncFilter?.project);

        try {
          if (!(await isAllowedUrl(peer.url))) {
            result.errors.push("peer URL blocked: private/local address not allowed");
            peer.status = "error";
            await kv.set(KV.mesh, peer.id, peer);
            await recordAudit(kv, "mesh_sync", "mem::mesh-sync", [peer.id], {
              action: "mesh.sync.error",
              error: "peer URL blocked: private/local address not allowed",
            });
            results.push(result);
            continue;
          }

          if (direction === "push" || direction === "both") {
            const pushData = await collectSyncData(kv, scopes, peer.lastSyncAt, peer.syncFilter);
            try {
              const response = await fetch(`${peer.url}/agentmemory/mesh/receive`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${meshAuthToken}`,
                },
                body: JSON.stringify(pushData),
                signal: AbortSignal.timeout(30000),
                redirect: "error",
              });
              if (response.ok) {
                const body = (await response.json()) as { accepted: number };
                result.pushed = body.accepted || 0;
              } else {
                result.errors.push(`push failed: HTTP ${response.status}`);
              }
            } catch (err) {
              result.errors.push(`push failed: ${String(err)}`);
            }
          }

          if (direction === "pull" || direction === "both") {
            try {
              const exportUrl = new URL(`${peer.url}/agentmemory/mesh/export`);
              exportUrl.searchParams.set("since", peer.lastSyncAt || "");
              if (projectFilter.scoped) {
                exportUrl.searchParams.set("project", projectFilter.project ?? "");
              }
              const response = await fetch(
                exportUrl.toString(),
                {
                  headers: {
                    Authorization: `Bearer ${meshAuthToken}`,
                  },
                  signal: AbortSignal.timeout(30000),
                  redirect: "error",
                },
              );
              if (response.ok) {
                const pullData = (await response.json()) as {
                  memories?: Memory[];
                  actions?: Action[];
                };
                result.pulled = await applySyncData(
                  kv,
                  filterPayloadByProject(pullData, projectFilter),
                  scopes,
                );
              } else {
                result.errors.push(`pull failed: HTTP ${response.status}`);
              }
            } catch (err) {
              result.errors.push(`pull failed: ${String(err)}`);
            }
          }

          peer.status = result.errors.length > 0 ? "error" : "connected";
          if (result.errors.length === 0) {
            peer.lastSyncAt = new Date().toISOString();
          }
        } catch (err) {
          peer.status = "disconnected";
          result.errors.push(String(err));
        }

        await kv.set(KV.mesh, peer.id, peer);
        await recordAudit(kv, "mesh_sync", "mem::mesh-sync", [peer.id], {
          action: result.errors.length > 0 ? "mesh.sync.error" : "mesh.sync.complete",
          direction,
          scopes,
          pushed: result.pushed,
          pulled: result.pulled,
          errors: result.errors,
          lastSyncAt: peer.lastSyncAt,
        });
        results.push(result);
      }

      return { success: true, results };
    },
  );

  sdk.registerFunction("mem::mesh-receive",
    async (data: MeshSyncPayload) => {
      if (!data || typeof data !== "object") {
        return { success: false, error: "payload required" };
      }
      let accepted = 0;

      accepted += await lwwMergeList(kv, KV.memories, data.memories, "mem:memory", "updatedAt");
      accepted += await lwwMergeList(kv, KV.actions, data.actions, "mem:action", "updatedAt");
      accepted += await lwwMergeList(kv, KV.semantic, data.semantic, "mem:semantic", "updatedAt");
      accepted += await lwwMergeList(kv, KV.procedural, data.procedural, "mem:procedural", "updatedAt");
      if (data.relations && Array.isArray(data.relations)) {
        for (const rel of data.relations) {
          if (!rel.sourceId || !rel.targetId || !rel.type) continue;
          const relKey = `${rel.sourceId}:${rel.targetId}:${rel.type}`;
          await withKeyedLock(`mem:relation:${relKey}`, async () => {
            const existing = await kv.get<MemoryRelation>(KV.relations, relKey);
            if (!existing) {
              await kv.set(KV.relations, relKey, rel);
              await recordAudit(kv, "mesh_sync", "mem::mesh-receive", [relKey], {
                action: "mesh.receive.relation",
                accepted: true,
              });
              accepted++;
            }
          });
        }
      }
      accepted += await lwwMergeGraphNodes(kv, data.graphNodes);
      accepted += await lwwMergeList(kv, KV.graphEdges, data.graphEdges, "mem:gedge", "createdAt");
      await recordAudit(kv, "mesh_sync", "mem::mesh-receive", [], {
        action: "mesh.receive",
        accepted,
      });

      return { success: true, accepted };
    },
  );

  sdk.registerFunction("mem::mesh-remove",
    async (data: { peerId: string }) => {
      if (!data || typeof data !== "object" || !data.peerId) {
        return { success: false, error: "peerId is required" };
      }
      await kv.delete(KV.mesh, data.peerId);
      await recordAudit(kv, "mesh_sync", "mem::mesh-remove", [data.peerId], {
        action: "mesh.remove",
      });
      return { success: true };
    },
  );
}

function deltaFilter<T>(
  items: T[],
  sinceTime: number,
  tsField: "updatedAt" | "createdAt",
): T[] {
  return items.filter(
    (item) => new Date((item as Record<string, unknown>)[tsField] as string).getTime() > sinceTime,
  );
}

async function collectSyncData(
  kv: StateKV,
  scopes: string[],
  since?: string,
  syncFilter?: { project?: string },
): Promise<MeshSyncPayload> {
  const result: MeshSyncPayload = {};
  const parsed = since ? new Date(since).getTime() : 0;
  const sinceTime = Number.isNaN(parsed) ? 0 : parsed;
  const projectFilter = normalizeProjectFilter(syncFilter?.project);

  if (scopes.includes("memories")) {
    const all = filterByProject(await kv.list<Memory>(KV.memories), projectFilter);
    result.memories = deltaFilter(all, sinceTime, "updatedAt");
  }

  if (scopes.includes("actions")) {
    const all = filterByProject(await kv.list<Action>(KV.actions), projectFilter);
    result.actions = deltaFilter(all, sinceTime, "updatedAt");
  }

  const projectScoped = projectFilter.scoped;

  if (scopes.includes("semantic") && !projectScoped) {
    const all = await kv.list<SemanticMemory>(KV.semantic);
    result.semantic = deltaFilter(all, sinceTime, "updatedAt");
  }

  if (scopes.includes("procedural") && !projectScoped) {
    const all = await kv.list<ProceduralMemory>(KV.procedural);
    result.procedural = deltaFilter(all, sinceTime, "updatedAt");
  }

  if (scopes.includes("relations") && !projectScoped) {
    const all = await kv.list<MemoryRelation>(KV.relations);
    result.relations = deltaFilter(all, sinceTime, "createdAt");
  }

  if (scopes.includes("graph:nodes") && !projectScoped) {
    const all = await kv.list<GraphNode>(KV.graphNodes);
    result.graphNodes = all.filter(
      (n) => new Date(graphNodeTs(n)).getTime() > sinceTime,
    );
  }

  if (scopes.includes("graph:edges") && !projectScoped) {
    const all = await kv.list<GraphEdge>(KV.graphEdges);
    result.graphEdges = deltaFilter(all, sinceTime, "createdAt");
  }

  return result;
}

async function applySyncData(
  kv: StateKV,
  data: MeshSyncPayload,
  scopes: string[],
): Promise<number> {
  let applied = 0;

  if (scopes.includes("memories")) {
    applied += await lwwMergeList(kv, KV.memories, data.memories, "mem:memory", "updatedAt");
  }
  if (scopes.includes("actions")) {
    applied += await lwwMergeList(kv, KV.actions, data.actions, "mem:action", "updatedAt");
  }
  if (scopes.includes("semantic")) {
    applied += await lwwMergeList(kv, KV.semantic, data.semantic, "mem:semantic", "updatedAt");
  }
  if (scopes.includes("procedural")) {
    applied += await lwwMergeList(kv, KV.procedural, data.procedural, "mem:procedural", "updatedAt");
  }
  if (scopes.includes("relations") && data.relations) {
    for (const rel of data.relations) {
      if (!rel.sourceId || !rel.targetId || !rel.type) continue;
      const relKey = `${rel.sourceId}:${rel.targetId}:${rel.type}`;
      const wrote = await withKeyedLock(`mem:relation:${relKey}`, async () => {
        const existing = await kv.get<MemoryRelation>(KV.relations, relKey);
        if (!existing) {
          await kv.set(KV.relations, relKey, rel);
          return true;
        }
        return false;
      });
      if (wrote) applied++;
    }
  }
  if (scopes.includes("graph:nodes")) {
    applied += await lwwMergeGraphNodes(kv, data.graphNodes);
  }
  if (scopes.includes("graph:edges")) {
    applied += await lwwMergeList(kv, KV.graphEdges, data.graphEdges, "mem:gedge", "createdAt");
  }

  return applied;
}

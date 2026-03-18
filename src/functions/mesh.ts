import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { MeshPeer, Memory, Action } from "../types.js";
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

export function registerMeshFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::mesh-register" },
    async (data: {
      url: string;
      name: string;
      sharedScopes?: string[];
    }) => {
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
        sharedScopes: data.sharedScopes || ["memories", "actions"],
      };

      await kv.set(KV.mesh, peer.id, peer);
      return { success: true, peer };
    },
  );

  sdk.registerFunction(
    { id: "mem::mesh-list" },
    async () => {
      const peers = await kv.list<MeshPeer>(KV.mesh);
      return { success: true, peers };
    },
  );

  sdk.registerFunction(
    { id: "mem::mesh-sync" },
    async (data: { peerId?: string; scopes?: string[]; direction?: "push" | "pull" | "both" }) => {
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

        const scopes = data.scopes || peer.sharedScopes;

        try {
          if (!(await isAllowedUrl(peer.url))) {
            result.errors.push("peer URL blocked: private/local address not allowed");
            peer.status = "error";
            await kv.set(KV.mesh, peer.id, peer);
            results.push(result);
            continue;
          }

          if (direction === "push" || direction === "both") {
            const pushData = await collectSyncData(kv, scopes, peer.lastSyncAt);
            try {
              const response = await fetch(`${peer.url}/agentmemory/mesh/receive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
              const response = await fetch(
                `${peer.url}/agentmemory/mesh/export?since=${peer.lastSyncAt || ""}`,
                { signal: AbortSignal.timeout(30000), redirect: "error" },
              );
              if (response.ok) {
                const pullData = (await response.json()) as {
                  memories?: Memory[];
                  actions?: Action[];
                };
                result.pulled = await applySyncData(kv, pullData, scopes);
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
        results.push(result);
      }

      return { success: true, results };
    },
  );

  sdk.registerFunction(
    { id: "mem::mesh-receive" },
    async (data: { memories?: Memory[]; actions?: Action[] }) => {
      let accepted = 0;

      if (data.memories && Array.isArray(data.memories)) {
        for (const mem of data.memories) {
          if (!mem.id || typeof mem.id !== "string" || !mem.updatedAt) continue;
          if (Number.isNaN(new Date(mem.updatedAt).getTime())) continue;
          const wrote = await withKeyedLock(`mem:memory:${mem.id}`, async () => {
            const existing = await kv.get<Memory>(KV.memories, mem.id);
            if (!existing) {
              await kv.set(KV.memories, mem.id, mem);
              return true;
            } else if (
              new Date(mem.updatedAt) > new Date(existing.updatedAt)
            ) {
              await kv.set(KV.memories, mem.id, mem);
              return true;
            }
            return false;
          });
          if (wrote) accepted++;
        }
      }

      if (data.actions && Array.isArray(data.actions)) {
        for (const action of data.actions) {
          if (!action.id || typeof action.id !== "string" || !action.updatedAt) continue;
          if (Number.isNaN(new Date(action.updatedAt).getTime())) continue;
          const wrote = await withKeyedLock(`mem:action:${action.id}`, async () => {
            const existing = await kv.get<Action>(KV.actions, action.id);
            if (!existing) {
              await kv.set(KV.actions, action.id, action);
              return true;
            } else if (
              new Date(action.updatedAt) > new Date(existing.updatedAt)
            ) {
              await kv.set(KV.actions, action.id, action);
              return true;
            }
            return false;
          });
          if (wrote) accepted++;
        }
      }

      return { success: true, accepted };
    },
  );

  sdk.registerFunction(
    { id: "mem::mesh-remove" },
    async (data: { peerId: string }) => {
      if (!data.peerId) {
        return { success: false, error: "peerId is required" };
      }
      await kv.delete(KV.mesh, data.peerId);
      return { success: true };
    },
  );
}

async function collectSyncData(
  kv: StateKV,
  scopes: string[],
  since?: string,
): Promise<{ memories?: Memory[]; actions?: Action[] }> {
  const result: { memories?: Memory[]; actions?: Action[] } = {};
  const parsed = since ? new Date(since).getTime() : 0;
  const sinceTime = Number.isNaN(parsed) ? 0 : parsed;

  if (scopes.includes("memories")) {
    const allMemories = await kv.list<Memory>(KV.memories);
    result.memories = allMemories.filter(
      (m) => new Date(m.updatedAt).getTime() > sinceTime,
    );
  }

  if (scopes.includes("actions")) {
    const allActions = await kv.list<Action>(KV.actions);
    result.actions = allActions.filter(
      (a) => new Date(a.updatedAt).getTime() > sinceTime,
    );
  }

  return result;
}

async function applySyncData(
  kv: StateKV,
  data: { memories?: Memory[]; actions?: Action[] },
  scopes: string[],
): Promise<number> {
  let applied = 0;

  if (scopes.includes("memories") && data.memories) {
    for (const mem of data.memories) {
      if (!mem.id || typeof mem.id !== "string" || !mem.updatedAt) continue;
      if (Number.isNaN(new Date(mem.updatedAt).getTime())) continue;
      const wrote = await withKeyedLock(`mem:memory:${mem.id}`, async () => {
        const existing = await kv.get<Memory>(KV.memories, mem.id);
        if (!existing || new Date(mem.updatedAt) > new Date(existing.updatedAt)) {
          await kv.set(KV.memories, mem.id, mem);
          return true;
        }
        return false;
      });
      if (wrote) applied++;
    }
  }

  if (scopes.includes("actions") && data.actions) {
    for (const action of data.actions) {
      if (!action.id || typeof action.id !== "string" || !action.updatedAt) continue;
      if (Number.isNaN(new Date(action.updatedAt).getTime())) continue;
      const wrote = await withKeyedLock(`mem:action:${action.id}`, async () => {
        const existing = await kv.get<Action>(KV.actions, action.id);
        if (!existing || new Date(action.updatedAt) > new Date(existing.updatedAt)) {
          await kv.set(KV.actions, action.id, action);
          return true;
        }
        return false;
      });
      if (wrote) applied++;
    }
  }

  return applied;
}

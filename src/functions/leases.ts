import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Action, Lease } from "../types.js";

const DEFAULT_LEASE_TTL_MS = 10 * 60 * 1000;
const MAX_LEASE_TTL_MS = 60 * 60 * 1000;

export function registerLeasesFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::lease-acquire" },
    async (data: { actionId: string; agentId: string; ttlMs?: number }) => {
      if (!data.actionId || !data.agentId) {
        return { success: false, error: "actionId and agentId are required" };
      }

      const rawTtl = typeof data.ttlMs === "number" && Number.isFinite(data.ttlMs) && data.ttlMs > 0
        ? data.ttlMs
        : DEFAULT_LEASE_TTL_MS;
      const ttl = Math.min(rawTtl, MAX_LEASE_TTL_MS);

      return withKeyedLock(`mem:action:${data.actionId}`, async () => {
        const action = await kv.get<Action>(KV.actions, data.actionId);
        if (!action) {
          return { success: false, error: "action not found" };
        }
        if (action.status === "done" || action.status === "cancelled") {
          return { success: false, error: "action already completed" };
        }
        if (action.status === "blocked") {
          return { success: false, error: "action is blocked" };
        }

        const existingLeases = await kv.list<Lease>(KV.leases);
        const activeLease = existingLeases.find(
          (l) =>
            l.actionId === data.actionId &&
            l.status === "active" &&
            new Date(l.expiresAt).getTime() > Date.now(),
        );

        if (activeLease) {
          if (activeLease.agentId === data.agentId) {
            return {
              success: true,
              lease: activeLease,
              renewed: false,
              message: "Already holding this lease",
            };
          }
          return {
            success: false,
            error: "action already leased",
            heldBy: activeLease.agentId,
            expiresAt: activeLease.expiresAt,
          };
        }

        const now = new Date();
        const lease: Lease = {
          id: generateId("lse"),
          actionId: data.actionId,
          agentId: data.agentId,
          acquiredAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttl).toISOString(),
          status: "active",
        };

        await kv.set(KV.leases, lease.id, lease);

        action.status = "active";
        action.assignedTo = data.agentId;
        action.updatedAt = now.toISOString();
        await kv.set(KV.actions, action.id, action);

        return { success: true, lease, renewed: false };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::lease-release" },
    async (data: { actionId: string; agentId: string; result?: string }) => {
      if (!data.actionId || !data.agentId) {
        return { success: false, error: "actionId and agentId are required" };
      }

      return withKeyedLock(`mem:action:${data.actionId}`, async () => {
        const leases = await kv.list<Lease>(KV.leases);
        const activeLease = leases.find(
          (l) =>
            l.actionId === data.actionId &&
            l.agentId === data.agentId &&
            l.status === "active" &&
            new Date(l.expiresAt).getTime() > Date.now(),
        );

        if (!activeLease) {
          return { success: false, error: "no active lease found for this agent" };
        }

        activeLease.status = "released";
        await kv.set(KV.leases, activeLease.id, activeLease);

        const action = await kv.get<Action>(KV.actions, data.actionId);
        if (action && action.status === "active" && action.assignedTo === data.agentId) {
          if (data.result) {
            action.status = "done";
            action.result = data.result;
          } else {
            action.status = "pending";
          }
          action.assignedTo = undefined;
          action.updatedAt = new Date().toISOString();
          await kv.set(KV.actions, action.id, action);
        }

        return { success: true, released: true };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::lease-renew" },
    async (data: { actionId: string; agentId: string; ttlMs?: number }) => {
      if (!data.actionId || !data.agentId) {
        return { success: false, error: "actionId and agentId are required" };
      }

      const rawTtl = typeof data.ttlMs === "number" && Number.isFinite(data.ttlMs) && data.ttlMs > 0
        ? data.ttlMs
        : DEFAULT_LEASE_TTL_MS;
      const ttl = Math.min(rawTtl, MAX_LEASE_TTL_MS);

      return withKeyedLock(`mem:action:${data.actionId}`, async () => {
        const leases = await kv.list<Lease>(KV.leases);
        const activeLease = leases.find(
          (l) =>
            l.actionId === data.actionId &&
            l.agentId === data.agentId &&
            l.status === "active" &&
            new Date(l.expiresAt).getTime() > Date.now(),
        );

        if (!activeLease) {
          return { success: false, error: "no active (non-expired) lease to renew" };
        }

        const now = new Date();
        const base = Math.max(now.getTime(), new Date(activeLease.expiresAt).getTime());
        activeLease.expiresAt = new Date(base + ttl).toISOString();
        activeLease.renewedAt = now.toISOString();
        await kv.set(KV.leases, activeLease.id, activeLease);

        return { success: true, lease: activeLease };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::lease-cleanup" },
    async () => {
      const leases = await kv.list<Lease>(KV.leases);
      const now = Date.now();
      let expired = 0;

      for (const lease of leases) {
        if (
          lease.status === "active" &&
          new Date(lease.expiresAt).getTime() <= now
        ) {
          const didExpire = await withKeyedLock(
            `mem:action:${lease.actionId}`,
            async () => {
              const currentLease = await kv.get<Lease>(KV.leases, lease.id);
              if (
                !currentLease ||
                currentLease.status !== "active" ||
                new Date(currentLease.expiresAt).getTime() > Date.now()
              ) {
                return false;
              }
              currentLease.status = "expired";
              await kv.set(KV.leases, currentLease.id, currentLease);

              const action = await kv.get<Action>(KV.actions, currentLease.actionId);
              const otherActiveLease = (await kv.list<Lease>(KV.leases)).some(
                (l) =>
                  l.id !== currentLease.id &&
                  l.actionId === currentLease.actionId &&
                  l.status === "active" &&
                  new Date(l.expiresAt).getTime() > Date.now(),
              );
              if (
                action &&
                !otherActiveLease &&
                action.status === "active" &&
                action.assignedTo === currentLease.agentId
              ) {
                action.status = "pending";
                action.assignedTo = undefined;
                action.updatedAt = new Date().toISOString();
                await kv.set(KV.actions, action.id, action);
              }
              return true;
            },
          );
          if (didExpire) expired++;
        }
      }

      return { success: true, expired };
    },
  );
}

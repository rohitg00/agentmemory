import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Action, ActionEdge, Checkpoint } from "../types.js";

export function registerCheckpointsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::checkpoint-create" },
    async (data: {
      name: string;
      description?: string;
      type?: Checkpoint["type"];
      linkedActionIds?: string[];
      expiresInMs?: number;
    }) => {
      if (!data.name) {
        return { success: false, error: "name is required" };
      }

      const validTypes: Checkpoint["type"][] = ["ci", "approval", "deploy", "external", "timer"];
      if (data.type && !validTypes.includes(data.type)) {
        return { success: false, error: `invalid checkpoint type: ${data.type}. Must be one of: ${validTypes.join(", ")}` };
      }

      const now = new Date();
      const checkpoint: Checkpoint = {
        id: generateId("ckpt"),
        name: data.name.trim(),
        description: (data.description || "").trim(),
        status: "pending",
        type: data.type || "external",
        createdAt: now.toISOString(),
        linkedActionIds: data.linkedActionIds || [],
        expiresAt: data.expiresInMs
          ? new Date(now.getTime() + data.expiresInMs).toISOString()
          : undefined,
      };

      if (data.linkedActionIds && data.linkedActionIds.length > 0) {
        for (const actionId of data.linkedActionIds) {
          const action = await kv.get<Action>(KV.actions, actionId);
          if (!action) {
            return { success: false, error: `linked action not found: ${actionId}` };
          }
        }
      }

      await kv.set(KV.checkpoints, checkpoint.id, checkpoint);

      if (data.linkedActionIds && data.linkedActionIds.length > 0) {
        for (const actionId of data.linkedActionIds) {
          const edge: ActionEdge = {
            id: generateId("ae"),
            type: "gated_by",
            sourceActionId: actionId,
            targetActionId: checkpoint.id,
            createdAt: now.toISOString(),
          };
          await kv.set(KV.actionEdges, edge.id, edge);

          const action = await kv.get<Action>(KV.actions, actionId);
          if (action && action.status === "pending") {
            action.status = "blocked";
            action.updatedAt = now.toISOString();
            await kv.set(KV.actions, action.id, action);
          }
        }
      }

      return { success: true, checkpoint };
    },
  );

  sdk.registerFunction(
    { id: "mem::checkpoint-resolve" },
    async (data: {
      checkpointId: string;
      status: "passed" | "failed";
      resolvedBy?: string;
      result?: unknown;
    }) => {
      if (!data.checkpointId || !data.status) {
        return {
          success: false,
          error: "checkpointId and status are required",
        };
      }

      return withKeyedLock(
        `mem:checkpoint:${data.checkpointId}`,
        async () => {
          const checkpoint = await kv.get<Checkpoint>(
            KV.checkpoints,
            data.checkpointId,
          );
          if (!checkpoint) {
            return { success: false, error: "checkpoint not found" };
          }
          if (checkpoint.status !== "pending") {
            return {
              success: false,
              error: `checkpoint already ${checkpoint.status}`,
            };
          }

          checkpoint.status = data.status;
          checkpoint.resolvedAt = new Date().toISOString();
          checkpoint.resolvedBy = data.resolvedBy;
          checkpoint.result = data.result;

          await kv.set(KV.checkpoints, checkpoint.id, checkpoint);

          let unblockedCount = 0;
          if (data.status === "passed" && checkpoint.linkedActionIds.length > 0) {
            const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
            const allCheckpoints = await kv.list<Checkpoint>(KV.checkpoints);
            const cpMap = new Map(allCheckpoints.map((c) => [c.id, c]));

            for (const actionId of checkpoint.linkedActionIds) {
              await withKeyedLock(`mem:action:${actionId}`, async () => {
                const action = await kv.get<Action>(KV.actions, actionId);
                if (action && action.status === "blocked") {
                  const gates = allEdges.filter(
                    (e) => e.sourceActionId === actionId && e.type === "gated_by",
                  );
                  const allGatesPassed = gates.every((g) => {
                    const cp = cpMap.get(g.targetActionId);
                    return cp && cp.status === "passed";
                  });
                  const requires = allEdges.filter(
                    (e) => e.sourceActionId === actionId && e.type === "requires",
                  );
                  const allActions = await kv.list<Action>(KV.actions);
                  const actionMap = new Map(allActions.map((a) => [a.id, a]));
                  const allRequiresMet = requires.every((r) => {
                    const dep = actionMap.get(r.targetActionId);
                    return dep && dep.status === "done";
                  });
                  if (allGatesPassed && allRequiresMet) {
                    action.status = "pending";
                    action.updatedAt = new Date().toISOString();
                    await kv.set(KV.actions, action.id, action);
                    unblockedCount++;
                  }
                }
              });
            }
          }

          return { success: true, checkpoint, unblockedCount };
        },
      );
    },
  );

  sdk.registerFunction(
    { id: "mem::checkpoint-list" },
    async (data: { status?: string; type?: string }) => {
      let checkpoints = await kv.list<Checkpoint>(KV.checkpoints);

      if (data.status) {
        checkpoints = checkpoints.filter((c) => c.status === data.status);
      }
      if (data.type) {
        checkpoints = checkpoints.filter((c) => c.type === data.type);
      }

      checkpoints.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return { success: true, checkpoints };
    },
  );

  sdk.registerFunction(
    { id: "mem::checkpoint-expire" },
    async () => {
      const checkpoints = await kv.list<Checkpoint>(KV.checkpoints);
      const now = Date.now();
      let expired = 0;

      for (const cp of checkpoints) {
        if (
          cp.status === "pending" &&
          cp.expiresAt &&
          new Date(cp.expiresAt).getTime() <= now
        ) {
          const didExpire = await withKeyedLock(
            `mem:checkpoint:${cp.id}`,
            async () => {
              const fresh = await kv.get<Checkpoint>(KV.checkpoints, cp.id);
              if (!fresh || fresh.status !== "pending") return false;
              fresh.status = "expired";
              fresh.resolvedAt = new Date().toISOString();
              await kv.set(KV.checkpoints, fresh.id, fresh);
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

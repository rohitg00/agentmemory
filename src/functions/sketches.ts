import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Action, ActionEdge, Sketch } from "../types.js";

export function registerSketchesFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::sketch-create" },
    async (data: {
      title: string;
      description?: string;
      expiresInMs?: number;
      project?: string;
    }) => {
      if (!data.title || typeof data.title !== "string") {
        return { success: false, error: "title is required" };
      }

      const now = new Date();
      const expiresInMs = data.expiresInMs || 3600000;
      const sketch: Sketch = {
        id: generateId("sk"),
        title: data.title.trim(),
        description: (data.description || "").trim(),
        status: "active",
        actionIds: [],
        project: data.project,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + expiresInMs).toISOString(),
      };

      await kv.set(KV.sketches, sketch.id, sketch);
      return { success: true, sketch };
    },
  );

  sdk.registerFunction(
    { id: "mem::sketch-add" },
    async (data: {
      sketchId: string;
      title: string;
      description?: string;
      priority?: number;
      dependsOn?: string[];
    }) => {
      if (!data.sketchId) {
        return { success: false, error: "sketchId is required" };
      }
      if (!data.title || typeof data.title !== "string") {
        return { success: false, error: "title is required" };
      }

      return withKeyedLock(`mem:sketch:${data.sketchId}`, async () => {
        const sketch = await kv.get<Sketch>(KV.sketches, data.sketchId);
        if (!sketch) {
          return { success: false, error: "sketch not found" };
        }
        if (sketch.status !== "active") {
          return { success: false, error: "sketch is not active" };
        }

        const now = new Date().toISOString();
        const action: Action = {
          id: generateId("act"),
          title: data.title.trim(),
          description: (data.description || "").trim(),
          status: "pending",
          priority: Math.max(1, Math.min(10, data.priority || 5)),
          createdAt: now,
          updatedAt: now,
          createdBy: "sketch",
          project: sketch.project,
          tags: [],
          sourceObservationIds: [],
          sourceMemoryIds: [],
          sketchId: data.sketchId,
        };

        if (data.dependsOn && data.dependsOn.length > 0) {
          const sketchActionSet = new Set(sketch.actionIds);
          for (const depId of data.dependsOn) {
            if (!sketchActionSet.has(depId)) {
              return {
                success: false,
                error: `dependency ${depId} not found in this sketch`,
              };
            }
          }
        }

        await kv.set(KV.actions, action.id, action);

        const createdEdges: ActionEdge[] = [];
        if (data.dependsOn && data.dependsOn.length > 0) {
          for (const depId of data.dependsOn) {
            const edge: ActionEdge = {
              id: generateId("ae"),
              type: "requires",
              sourceActionId: action.id,
              targetActionId: depId,
              createdAt: now,
            };
            await kv.set(KV.actionEdges, edge.id, edge);
            createdEdges.push(edge);
          }
        }

        sketch.actionIds.push(action.id);
        await kv.set(KV.sketches, sketch.id, sketch);

        return { success: true, action, edges: createdEdges };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::sketch-promote" },
    async (data: { sketchId: string; project?: string }) => {
      if (!data.sketchId) {
        return { success: false, error: "sketchId is required" };
      }

      return withKeyedLock(`mem:sketch:${data.sketchId}`, async () => {
        const sketch = await kv.get<Sketch>(KV.sketches, data.sketchId);
        if (!sketch) {
          return { success: false, error: "sketch not found" };
        }
        if (sketch.status !== "active") {
          return { success: false, error: "sketch is not active" };
        }

        const promotedIds: string[] = [];
        for (const actionId of sketch.actionIds) {
          const action = await kv.get<Action>(KV.actions, actionId);
          if (action) {
            delete action.sketchId;
            if (data.project) {
              action.project = data.project;
            }
            action.updatedAt = new Date().toISOString();
            await kv.set(KV.actions, action.id, action);
            promotedIds.push(action.id);
          }
        }

        sketch.status = "promoted";
        sketch.promotedAt = new Date().toISOString();
        await kv.set(KV.sketches, sketch.id, sketch);

        return { success: true, promotedIds };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::sketch-discard" },
    async (data: { sketchId: string }) => {
      if (!data.sketchId) {
        return { success: false, error: "sketchId is required" };
      }

      return withKeyedLock(`mem:sketch:${data.sketchId}`, async () => {
        const sketch = await kv.get<Sketch>(KV.sketches, data.sketchId);
        if (!sketch) {
          return { success: false, error: "sketch not found" };
        }
        if (sketch.status !== "active") {
          return { success: false, error: "sketch is not active" };
        }

        const actionIdSet = new Set(sketch.actionIds);

        const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
        for (const edge of allEdges) {
          if (
            actionIdSet.has(edge.sourceActionId) ||
            actionIdSet.has(edge.targetActionId)
          ) {
            await kv.delete(KV.actionEdges, edge.id);
          }
        }

        for (const actionId of sketch.actionIds) {
          await kv.delete(KV.actions, actionId);
        }

        sketch.status = "discarded";
        sketch.discardedAt = new Date().toISOString();
        await kv.set(KV.sketches, sketch.id, sketch);

        return { success: true, discardedCount: sketch.actionIds.length };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::sketch-list" },
    async (data: { status?: string; project?: string }) => {
      let sketches = await kv.list<Sketch>(KV.sketches);

      if (data.status) {
        sketches = sketches.filter((s) => s.status === data.status);
      }
      if (data.project) {
        sketches = sketches.filter((s) => s.project === data.project);
      }

      sketches.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const results = sketches.map((s) => ({
        ...s,
        actionCount: s.actionIds.length,
      }));

      return { success: true, sketches: results };
    },
  );

  sdk.registerFunction(
    { id: "mem::sketch-gc" },
    async () => {
      const sketches = await kv.list<Sketch>(KV.sketches);
      const now = Date.now();
      let collected = 0;

      for (const sketch of sketches) {
        if (
          sketch.status !== "active" ||
          new Date(sketch.expiresAt).getTime() > now
        ) {
          continue;
        }

        await withKeyedLock(`mem:sketch:${sketch.id}`, async () => {
          const current = await kv.get<Sketch>(KV.sketches, sketch.id);
          if (
            !current ||
            current.status !== "active" ||
            new Date(current.expiresAt).getTime() > now
          ) {
            return;
          }

          const actionIdSet = new Set(current.actionIds);

          const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
          for (const edge of allEdges) {
            if (
              actionIdSet.has(edge.sourceActionId) ||
              actionIdSet.has(edge.targetActionId)
            ) {
              await kv.delete(KV.actionEdges, edge.id);
            }
          }

          for (const actionId of current.actionIds) {
            await kv.delete(KV.actions, actionId);
          }

          current.status = "discarded";
          current.discardedAt = new Date().toISOString();
          await kv.set(KV.sketches, current.id, current);
          collected++;
        });
      }

      return { success: true, collected };
    },
  );
}

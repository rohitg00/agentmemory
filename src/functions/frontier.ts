import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Action, ActionEdge, Checkpoint, Lease } from "../types.js";

export interface FrontierItem {
  action: Action;
  score: number;
  blockers: string[];
  leased: boolean;
}

export function registerFrontierFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::frontier" },
    async (data: {
      project?: string;
      agentId?: string;
      limit?: number;
      includeLeasedByOthers?: boolean;
    }) => {
      const actions = await kv.list<Action>(KV.actions);
      const edges = await kv.list<ActionEdge>(KV.actionEdges);
      const leases = await kv.list<Lease>(KV.leases);
      const checkpoints = await kv.list<Checkpoint>(KV.checkpoints);
      const now = Date.now();

      const activeLeaseMap = new Map<string, Lease>();
      for (const lease of leases) {
        if (
          lease.status === "active" &&
          new Date(lease.expiresAt).getTime() > now
        ) {
          activeLeaseMap.set(lease.actionId, lease);
        }
      }

      const checkpointMap = new Map<string, Checkpoint>();
      for (const cp of checkpoints) {
        checkpointMap.set(cp.id, cp);
      }

      const actionMap = new Map<string, Action>();
      for (const a of actions) actionMap.set(a.id, a);

      const frontier: FrontierItem[] = [];

      for (const action of actions) {
        if (action.status === "done" || action.status === "cancelled") continue;
        if (data.project && action.project !== data.project) continue;

        const blockers: string[] = [];
        const inEdges = edges.filter(
          (e) => e.sourceActionId === action.id && e.type === "requires",
        );

        for (const edge of inEdges) {
          const dep = actionMap.get(edge.targetActionId);
          if (dep && dep.status !== "done") {
            blockers.push(`requires:${dep.id}:${dep.title}`);
          }
        }

        const gateEdges = edges.filter(
          (e) => e.sourceActionId === action.id && e.type === "gated_by",
        );
        for (const edge of gateEdges) {
          const cp = checkpointMap.get(edge.targetActionId);
          if (cp && cp.status !== "passed") {
            blockers.push(`checkpoint:${cp.id}:${cp.name}`);
          }
        }

        const conflictEdges = edges.filter(
          (e) =>
            (e.sourceActionId === action.id ||
              e.targetActionId === action.id) &&
            e.type === "conflicts_with",
        );
        for (const edge of conflictEdges) {
          const otherId =
            edge.sourceActionId === action.id
              ? edge.targetActionId
              : edge.sourceActionId;
          const other = actionMap.get(otherId);
          if (other && other.status === "active") {
            blockers.push(`conflict:${other.id}:${other.title}`);
          }
        }

        if (blockers.length > 0) continue;

        const lease = activeLeaseMap.get(action.id);
        const leasedByOther =
          lease && data.agentId && lease.agentId !== data.agentId;
        if (leasedByOther && !data.includeLeasedByOthers) continue;

        const score = computeScore(action, edges, now);

        frontier.push({
          action,
          score,
          blockers: [],
          leased: !!lease,
        });
      }

      frontier.sort((a, b) => b.score - a.score);
      const limit = data.limit || 20;

      return {
        success: true,
        frontier: frontier.slice(0, limit),
        totalActions: actions.length,
        totalUnblocked: frontier.length,
      };
    },
  );

  sdk.registerFunction(
    { id: "mem::next" },
    async (data: { project?: string; agentId?: string }) => {
      const result = await sdk.trigger<
        { project?: string; agentId?: string; limit?: number },
        {
          success: boolean;
          frontier: FrontierItem[];
          totalActions: number;
          totalUnblocked: number;
        }
      >("mem::frontier", {
        project: data.project,
        agentId: data.agentId,
        limit: 1,
      });

      if (!result.success) {
        return {
          success: false,
          suggestion: null,
          message: "Failed to compute frontier",
          totalActions: 0,
        };
      }
      if (result.frontier.length === 0) {
        return {
          success: true,
          suggestion: null,
          message: "No actionable work found",
          totalActions: result.totalActions || 0,
        };
      }

      const top = result.frontier[0];
      return {
        success: true,
        suggestion: {
          actionId: top.action.id,
          title: top.action.title,
          description: top.action.description,
          priority: top.action.priority,
          score: top.score,
          tags: top.action.tags,
        },
        message: `Suggested: ${top.action.title} (priority ${top.action.priority}, score ${top.score.toFixed(2)})`,
        totalActions: result.totalActions,
        totalUnblocked: result.totalUnblocked,
      };
    },
  );
}

function computeScore(
  action: Action,
  edges: ActionEdge[],
  now: number,
): number {
  let score = action.priority * 10;

  const ageHours =
    (now - new Date(action.createdAt).getTime()) / (1000 * 60 * 60);
  score += Math.min(ageHours * 0.5, 20);

  const unlockCount = edges.filter(
    (e) => e.sourceActionId === action.id && e.type === "unlocks",
  ).length;
  score += unlockCount * 5;

  if (edges.some((e) => e.sourceActionId === action.id && e.type === "spawned_by")) {
    score += 3;
  }

  if (action.status === "active") score += 15;

  return Math.round(score * 100) / 100;
}

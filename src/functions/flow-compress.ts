import type { IIIClient } from "iii-sdk";
import { collectAll, type StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { sharesMemoryScope, supersededAt } from "../state/memory-utils.js";
import type { Action, ActionEdge, Memory, RoutineRun, MemoryProvider } from "../types.js";
import { getAgentId } from "../config.js";
import { logger } from "../logger.js";
import { safeAudit } from "./audit.js";
import { indexMemory, unindexMemory } from "./search.js";
import { memoryTitleFromContent } from "./remember.js";

type FlowMemory = Memory & { metadata?: { flowCompressed?: boolean; actionCount?: number; actionIds?: string[] } };

function trimmed(value: unknown, max = 512): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function flowKey(ids: string[]): string {
  return [...new Set(ids)].sort().join("\n");
}

const FLOW_COMPRESS_SYSTEM = `You are a workflow summarizer. Given a completed action chain, produce a concise summary capturing:
1. The overall goal and outcome
2. Key steps taken and their results
3. Any notable decisions or discoveries
4. Lessons learned

Output as XML:
<summary>
<goal>What was the workflow trying to achieve</goal>
<outcome>What happened</outcome>
<steps>Numbered list of key steps</steps>
<discoveries>Any new insights or discoveries</discoveries>
<lesson>What to remember for next time</lesson>
</summary>`;

export function registerFlowCompressFunction(
  sdk: IIIClient,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::flow-compress", 
    async (data: { runId?: string; actionIds?: string[]; project?: string; agentId?: string }) => {
      if (data.runId !== undefined && typeof data.runId !== "string") {
        return { success: false, error: "runId must be a string" };
      }
      if (
        data.actionIds !== undefined &&
        (!Array.isArray(data.actionIds) || data.actionIds.some((id) => typeof id !== "string"))
      ) {
        return { success: false, error: "actionIds must be an array of strings" };
      }
      const requestedProject = trimmed(data.project);
      const agentId = trimmed(data.agentId, 128) ?? getAgentId();
      data = { ...data, project: requestedProject };
      let actionsToCompress: Action[] = [];

      if (data.runId) {
        const run = await kv.get<RoutineRun>(KV.routineRuns, data.runId);
        if (!run) {
          return { success: false, error: "run not found" };
        }
        for (const id of run.actionIds) {
          const action = await kv.get<Action>(KV.actions, id);
          if (action) actionsToCompress.push(action);
        }
      } else if (data.actionIds && data.actionIds.length > 0) {
        for (const id of data.actionIds) {
          const action = await kv.get<Action>(KV.actions, id);
          if (action) actionsToCompress.push(action);
        }
      } else if (data.project) {
        const allActions = await kv.list<Action>(KV.actions);
        actionsToCompress = allActions.filter(
          (a) => a.project === data.project && a.status === "done",
        );
      } else {
        return {
          success: false,
          error: "runId, actionIds, or project is required",
        };
      }

      const doneActions = actionsToCompress.filter(
        (a) => a.status === "done",
      );
      if (doneActions.length === 0) {
        return {
          success: true,
          message: "No completed actions to compress",
          compressed: 0,
        };
      }

      const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
      const relevantIds = new Set(doneActions.map((a) => a.id));
      const relevantEdges = allEdges.filter(
        (e) =>
          relevantIds.has(e.sourceActionId) ||
          relevantIds.has(e.targetActionId),
      );

      const prompt = buildFlowPrompt(doneActions, relevantEdges);

      try {
        const response = await provider.summarize(
          FLOW_COMPRESS_SYSTEM,
          prompt,
        );
        const summary = parseFlowSummary(response);
        const content = formatSummary(summary);
        if (!content) {
          logger.warn("Flow summary had no recognized sections; nothing stored", {
            actionCount: doneActions.length,
          });
          return {
            success: false,
            error: "summary could not be parsed",
            compressed: 0,
          };
        }

        const actionProjects = new Set(doneActions.map((a) => a.project));
        const project = requestedProject
          ? doneActions.every((a) => a.project === requestedProject) ? requestedProject : undefined
          : actionProjects.size === 1 ? doneActions[0].project : undefined;
        const actionIds = doneActions.map((a) => a.id);
        const key = flowKey(actionIds);

        const { memory, previous } = await withKeyedLock("mem:remember", async () => {
          const ts = new Date().toISOString();
          const scope = { project, agentId };
          const memories = await collectAll<FlowMemory>(kv, KV.memories);
          const previous = memories.find((m) =>
            m.isLatest !== false &&
            m.metadata?.flowCompressed === true &&
            Array.isArray(m.metadata.actionIds) &&
            flowKey(m.metadata.actionIds) === key &&
            sharesMemoryScope(m, scope) &&
            (m.project || undefined) === project,
          );
          const memory: FlowMemory = {
            id: generateId("mem"),
            createdAt: ts,
            updatedAt: ts,
            type: "workflow",
            title: summary.goal ? memoryTitleFromContent(summary.goal) : `Workflow: ${doneActions.length} actions`,
            content,
            concepts: extractConcepts(doneActions),
            files: extractFiles(doneActions),
            sessionIds: [],
            strength: 1.0,
            version: previous ? (previous.version ?? 1) + 1 : 1,
            isLatest: true,
            ...(previous && { parentId: previous.id, supersedes: [previous.id, ...(previous.supersedes ?? [])] }),
            ...(agentId && { agentId }),
            ...(project && { project }),
            metadata: {
              flowCompressed: true,
              actionCount: doneActions.length,
              actionIds,
            },
          };
          await kv.set(KV.memories, memory.id, memory);
          if (previous) {
            try {
              await kv.set(KV.memories, previous.id, {
                ...previous,
                isLatest: false,
                updatedAt: supersededAt(previous.updatedAt, ts),
              });
            } catch (err) {
              await kv.delete(KV.memories, memory.id);
              throw err;
            }
            unindexMemory(previous.id);
          }
          return { memory, previous };
        });

        await safeAudit(kv, previous ? "evolve" : "compress", "mem::flow-compress", [memory.id], {
          action: "compress_flow",
          flowCompressed: true,
          actionCount: doneActions.length,
          ...(previous && { oldId: previous.id, newId: memory.id }),
          project,
        });
        try {
          await indexMemory(kv, memory);
        } catch (err) {
          logger.warn("Flow-compressed memory indexing failed", {
            memId: memory.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        return {
          success: true,
          compressed: doneActions.length,
          memoryId: memory.id,
          ...(previous && { supersededId: previous.id }),
          summary,
        };
      } catch (err) {
        return {
          success: false,
          error: `compression failed: ${String(err)}`,
          compressed: 0,
        };
      }
    },
  );
}

function buildFlowPrompt(
  actions: Action[],
  edges: ActionEdge[],
): string {
  const lines: string[] = ["## Completed Action Chain\n"];

  const sorted = [...actions].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const action of sorted) {
    lines.push(`### ${action.title}`);
    if (action.description) lines.push(action.description);
    if (action.result) lines.push(`Result: ${action.result}`);
    lines.push(`Priority: ${action.priority}, Tags: ${(action.tags ?? []).join(", ")}`);
    lines.push("");
  }

  if (edges.length > 0) {
    lines.push("## Dependencies");
    for (const edge of edges) {
      lines.push(`- ${edge.sourceActionId} --${edge.type}--> ${edge.targetActionId}`);
    }
  }

  return lines.join("\n");
}

function parseFlowSummary(response: string): {
  goal: string;
  outcome: string;
  steps: string;
  discoveries: string;
  lesson: string;
} {
  const extract = (tag: string): string => {
    const match = response.match(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`),
    );
    return match ? match[1].trim() : "";
  };
  return {
    goal: extract("goal"),
    outcome: extract("outcome"),
    steps: extract("steps"),
    discoveries: extract("discoveries"),
    lesson: extract("lesson"),
  };
}

function formatSummary(s: {
  goal: string;
  outcome: string;
  steps: string;
  discoveries: string;
  lesson: string;
}): string {
  const parts: string[] = [];
  if (s.goal) parts.push(`Goal: ${s.goal}`);
  if (s.outcome) parts.push(`Outcome: ${s.outcome}`);
  if (s.steps) parts.push(`Steps: ${s.steps}`);
  if (s.discoveries) parts.push(`Discoveries: ${s.discoveries}`);
  if (s.lesson) parts.push(`Lesson: ${s.lesson}`);
  return parts.join("\n\n");
}

function extractConcepts(actions: Action[]): string[] {
  const concepts = new Set<string>();
  for (const a of actions) {
    for (const tag of a.tags ?? []) {
      if (!tag.startsWith("routine:")) concepts.add(tag);
    }
  }
  return Array.from(concepts);
}

function extractFiles(actions: Action[]): string[] {
  const files = new Set<string>();
  for (const a of actions) {
    if (a.metadata && typeof a.metadata === "object") {
      const meta = a.metadata as Record<string, unknown>;
      if (Array.isArray(meta.files)) {
        for (const f of meta.files) {
          if (typeof f === "string") files.add(f);
        }
      }
    }
  }
  return Array.from(files);
}

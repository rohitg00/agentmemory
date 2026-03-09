import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import type { Action, ActionEdge, RoutineRun, MemoryProvider } from "../types.js";

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
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    { id: "mem::flow-compress" },
    async (data: { runId?: string; actionIds?: string[]; project?: string }) => {
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

        const memory = {
          id: generateId("mem"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          type: "workflow" as const,
          title: summary.goal || `Workflow: ${doneActions.length} actions`,
          content: formatSummary(summary),
          concepts: extractConcepts(doneActions),
          files: extractFiles(doneActions),
          sessionIds: [],
          strength: 1.0,
          version: 1,
          isLatest: true,
          metadata: {
            flowCompressed: true,
            actionCount: doneActions.length,
            actionIds: doneActions.map((a) => a.id),
          },
        };

        await kv.set(KV.memories, memory.id, memory);

        return {
          success: true,
          compressed: doneActions.length,
          memoryId: memory.id,
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
      new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`),
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

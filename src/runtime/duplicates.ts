import type { IIIClient } from "iii-sdk";
import { logger } from "../logger.js";

export interface DuplicateWorkerInfo {
  count: number;
  workerIds: string[];
}

let last: DuplicateWorkerInfo | null = null;
let lastKey = "";
// Checks can overlap (worker events, the fallback tick, a state-worker
// return). A check only publishes when no check started after it already has.
let started = 0;
let applied = 0;

export function getDuplicateWorkers(): DuplicateWorkerInfo | null {
  return last;
}

export function resetDuplicateWorkersForTest(): void {
  last = null;
  lastKey = "";
  started = 0;
  applied = 0;
}

export async function checkDuplicateWorkers(sdk: IIIClient): Promise<DuplicateWorkerInfo | null> {
  const seq = ++started;
  try {
    const listed = await sdk.trigger({ function_id: "engine::workers::list", payload: {} });
    if (seq < applied) return last;
    applied = seq;
    const entries = Array.isArray(listed)
      ? listed
      : (((listed as { workers?: unknown[] })?.workers ?? []) as unknown[]);
    const matches: string[] = [];
    for (const entry of entries) {
      if (typeof entry === "string") continue;
      const w = entry as { worker_id?: string; id?: string; worker_name?: string; name?: string; workerName?: string };
      const name = w.worker_name ?? w.workerName ?? w.name;
      if (name === "agentmemory") matches.push(w.worker_id ?? w.id ?? "unknown");
    }
    if (matches.length > 1) {
      last = { count: matches.length, workerIds: matches };
      const key = matches.slice().sort().join(",");
      if (key !== lastKey) {
        lastKey = key;
        logger.warn("Multiple agentmemory workers registered to the engine; this instance may be duplicated", { count: matches.length, workerIds: matches });
      }
    } else {
      last = null;
      lastKey = "";
    }
    return last;
  } catch {
    return last;
  }
}

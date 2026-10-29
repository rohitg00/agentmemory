import type { IIIClient } from "iii-sdk";
import { logger } from "../logger.js";

export interface DuplicateWorkerInfo {
  count: number;
  workerIds: string[];
}

let last: DuplicateWorkerInfo | null = null;
let lastKey = "";

export function getDuplicateWorkers(): DuplicateWorkerInfo | null {
  return last;
}

export function resetDuplicateWorkersForTest(): void {
  last = null;
  lastKey = "";
}

export async function checkDuplicateWorkers(sdk: IIIClient): Promise<DuplicateWorkerInfo | null> {
  try {
    const listed = await sdk.trigger({ function_id: "engine::workers::list", payload: {} });
    const entries = Array.isArray(listed)
      ? listed
      : (((listed as { workers?: unknown[] })?.workers ?? []) as unknown[]);
    const matches: string[] = [];
    for (const entry of entries) {
      if (typeof entry === "string") continue;
      const w = entry as { worker_id?: string; worker_name?: string; name?: string; workerName?: string };
      const name = w.worker_name ?? w.workerName ?? w.name;
      if (name === "agentmemory") matches.push(w.worker_id ?? w.worker_name ?? "unknown");
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

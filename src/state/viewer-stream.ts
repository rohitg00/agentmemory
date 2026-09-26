import type { IIIClient } from "iii-sdk";
import { STREAM } from "./schema.js";
import { getViewerStreamMax } from "../config.js";
import { logger } from "../logger.js";

const PRUNE_BATCH_INTERVAL = 50;
const DELETE_BATCH_SIZE = 100;
const UNSHIFT_CHUNK_SIZE = 1000;

const trackedItemIds: string[] = [];
let writesSincePrune = 0;
let pruning = false;
let pruneAgain = false;

export function trackViewerStreamItem(itemId: string): void {
  trackedItemIds.push(itemId);
  writesSincePrune += 1;
}

function unshiftMany(target: string[], items: string[]): void {
  for (let end = items.length; end > 0; end -= UNSHIFT_CHUNK_SIZE) {
    const start = Math.max(0, end - UNSHIFT_CHUNK_SIZE);
    target.splice(0, 0, ...items.slice(start, end));
  }
}

async function deleteItems(sdk: IIIClient, itemIds: string[]): Promise<string[]> {
  const failedItemIds: string[] = [];
  for (let start = 0; start < itemIds.length; start += DELETE_BATCH_SIZE) {
    const batch = itemIds.slice(start, start + DELETE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((itemId) =>
        sdk.trigger({
          function_id: "stream::delete",
          payload: {
            stream_name: STREAM.name,
            group_id: STREAM.viewerGroup,
            item_id: itemId,
          },
        }),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        logger.warn("Failed to prune viewer stream item", {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        failedItemIds.push(batch[i]);
      }
    }
  }
  return failedItemIds;
}

async function pruneOverflow(sdk: IIIClient): Promise<void> {
  if (pruning) {
    pruneAgain = true;
    return;
  }
  pruning = true;
  try {
    do {
      pruneAgain = false;
      const overflow = trackedItemIds.length - getViewerStreamMax();
      if (overflow <= 0) break;
      const candidates = trackedItemIds.splice(0, overflow);
      const failedItemIds = await deleteItems(sdk, candidates);
      if (failedItemIds.length > 0) unshiftMany(trackedItemIds, failedItemIds);
    } while (pruneAgain);
  } finally {
    pruning = false;
  }
}

export async function pruneViewerStreamIfDue(sdk: IIIClient): Promise<void> {
  if (writesSincePrune < PRUNE_BATCH_INTERVAL) return;
  writesSincePrune = 0;
  await pruneOverflow(sdk);
}

type StoredViewerItem = {
  observation?: { id?: unknown; timestamp?: unknown };
};

export async function seedViewerStreamTracker(sdk: IIIClient): Promise<number> {
  let items: StoredViewerItem[];
  try {
    items = await sdk.trigger<unknown, StoredViewerItem[]>({
      function_id: "stream::list",
      payload: { stream_name: STREAM.name, group_id: STREAM.viewerGroup },
    });
  } catch (err) {
    logger.warn("Could not read the viewer stream backlog", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
  if (!Array.isArray(items)) return 0;
  const known = new Set(trackedItemIds);
  const stored = items
    .map((item) => ({
      id: item?.observation?.id,
      at: Date.parse(String(item?.observation?.timestamp ?? "")),
    }))
    .filter((item): item is { id: string; at: number } => typeof item.id === "string" && !known.has(item.id))
    .sort((a, b) => (Number.isFinite(a.at) ? a.at : 0) - (Number.isFinite(b.at) ? b.at : 0))
    .map((item) => item.id);
  unshiftMany(trackedItemIds, stored);
  await pruneOverflow(sdk);
  return stored.length;
}

export function resetViewerStreamTracker(): void {
  trackedItemIds.length = 0;
  writesSincePrune = 0;
  pruning = false;
  pruneAgain = false;
}

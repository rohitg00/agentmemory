import type { IIIClient } from "iii-sdk";
import { STREAM } from "./schema.js";
import { getViewerStreamMax } from "../config.js";
import { logger } from "../logger.js";

const PRUNE_BATCH_INTERVAL = 50;

const trackedItemIds: string[] = [];
let writesSincePrune = 0;

export function trackViewerStreamItem(itemId: string): void {
  trackedItemIds.push(itemId);
  writesSincePrune += 1;
}

export async function pruneViewerStreamIfDue(sdk: IIIClient): Promise<void> {
  if (writesSincePrune < PRUNE_BATCH_INTERVAL) return;
  writesSincePrune = 0;

  const overflow = trackedItemIds.length - getViewerStreamMax();
  if (overflow <= 0) return;

  const staleIds = trackedItemIds.splice(0, overflow);
  const results = await Promise.allSettled(
    staleIds.map((itemId) =>
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

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("Failed to prune viewer stream item", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  }
}

export function resetViewerStreamTracker(): void {
  trackedItemIds.length = 0;
  writesSincePrune = 0;
}

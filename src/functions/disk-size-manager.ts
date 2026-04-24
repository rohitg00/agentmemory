import type { ISdk } from "iii-sdk";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { getMaxBytes } from "../utils/image-store.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";
import type { StateScope, StateScopeKey } from "../types.js";

const DISK_SIZE_KEY: StateScopeKey = "system:currentDiskSize";

export function registerDiskSizeManager(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::disk-size-delta",
    async (data: { deltaBytes: number }) => {
      if (typeof data?.deltaBytes !== "number" || !isFinite(data.deltaBytes)) {
        return { success: false, error: "deltaBytes must be a finite number" };
      }

      return withKeyedLock(DISK_SIZE_KEY, async () => {
        const currentTotal =
          (await kv.get<StateScope[typeof DISK_SIZE_KEY]>(KV.state, DISK_SIZE_KEY)) || 0;
        let newTotal = currentTotal + data.deltaBytes;

        if (newTotal < 0) newTotal = 0;

        await kv.set<StateScope[typeof DISK_SIZE_KEY]>(KV.state, DISK_SIZE_KEY, newTotal);

        if (data.deltaBytes > 0 && newTotal > getMaxBytes()) {
          sdk.triggerVoid("mem::image-quota-cleanup", {});
          logger.info("Disk quota exceeded, cleanup triggered", {
            currentBytes: newTotal,
            maxBytes: getMaxBytes(),
          });
        }

        return { success: true, currentTotal: newTotal };
      });
    },
  );
}

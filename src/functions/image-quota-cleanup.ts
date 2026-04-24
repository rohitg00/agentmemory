import type { ISdk } from "iii-sdk";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { IMAGES_DIR, getMaxBytes, deleteImage } from "../utils/image-store.js";
import { getImageRefCount } from "./image-refs.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";

const GRACE_PERIOD_MS = 30_000;

export function registerImageQuotaCleanup(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::image-quota-cleanup",
    async () => {
      const now = Date.now();

      return withKeyedLock("system:cleanupLock", async () => {
        let totalSize = 0;
        const fileStats: Array<{ filePath: string; size: number; mtimeMs: number }> = [];

        try {
          const files = await readdir(IMAGES_DIR);
          for (const file of files) {
            if (file.startsWith(".")) continue;
            const filePath = join(IMAGES_DIR, file);
            const s = await stat(filePath);
            if (s.isFile()) {
              fileStats.push({ filePath, size: s.size, mtimeMs: s.mtimeMs });
              totalSize += s.size;
            }
          }
        } catch {
          return { success: true, evicted: 0, freedBytes: 0 };
        }

        const limit = getMaxBytes();
        if (totalSize <= limit) {
          return { success: true, evicted: 0, freedBytes: 0, underQuota: true };
        }

        fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

        let totalToFree = totalSize - limit;
        let evicted = 0;
        let freedBytes = 0;

        for (const f of fileStats) {
          if (totalToFree <= 0) break;

          if (now - f.mtimeMs < GRACE_PERIOD_MS) {
            continue;
          }

          await withKeyedLock(`imgRef:${f.filePath}`, async () => {
            let refCount: number;
            try {
              refCount = await getImageRefCount(kv, f.filePath);
            } catch (err) {
              // Fail-closed: if we cannot determine refCount we must NOT
              // delete the image. Previously we let refCount fall through
              // to the default 0 and evicted, which risks deleting
              // still-referenced images on transient KV errors.
              logger.error("Failed to read refCount; skipping eviction", {
                filePath: f.filePath,
                error: err instanceof Error ? err.message : String(err),
              });
              return;
            }

            if (refCount > 0) {
              return;
            }

            const { deletedBytes } = await deleteImage(f.filePath);
            if (deletedBytes > 0) {
              sdk.triggerVoid("mem::disk-size-delta", { deltaBytes: -deletedBytes });
              totalToFree -= deletedBytes;
              freedBytes += deletedBytes;
              evicted++;
            }
          });
        }

        if (evicted > 0) {
          const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
          logger.info("Image quota cleanup complete", { evicted, freedMb });
        }

        return { success: true, evicted, freedBytes };
      });
    },
  );
}

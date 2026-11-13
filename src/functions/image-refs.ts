import { TriggerAction, type IIIClient } from "iii-sdk";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { deleteImage, touchImage } from "../utils/image-store.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { logger } from "../logger.js";

export async function getImageRefCount(kv: StateKV, filePath: string): Promise<number> {
  const count = await kv.get<number>(KV.imageRefs, filePath);
  return count ? Number(count) : 0;
}

export async function incrementImageRef(kv: StateKV, filePath: string): Promise<void> {
  return withKeyedLock(`imgRef:${filePath}`, async () => {
    const current = await getImageRefCount(kv, filePath);
    await kv.set(KV.imageRefs, filePath, current + 1);
    await touchImage(filePath);
  });
}

export async function decrementImageRef(kv: StateKV, sdk: IIIClient, filePath: string): Promise<void> {
  return withKeyedLock(`imgRef:${filePath}`, async () => {
    const current = await getImageRefCount(kv, filePath);
    if (current <= 1) {
      await kv.delete(KV.imageEmbeddings, filePath);
      await kv.delete(KV.imageRefs, filePath);
      const { deletedBytes } = await deleteImage(filePath);
      if (deletedBytes > 0) {
        sdk.trigger({
          function_id: "mem::disk-size-delta",
          payload: { deltaBytes: -deletedBytes },
          action: TriggerAction.Void(),
        });
      }
    } else {
      await kv.set(KV.imageRefs, filePath, current - 1);
    }
  });
}

export async function releaseImageRef(kv: StateKV, sdk: IIIClient, ownerId: string, filePath: string): Promise<void> {
  try {
    await decrementImageRef(kv, sdk, filePath);
  } catch (err) {
    logger.warn("Image reference release failed after delete", {
      ownerId,
      imageRef: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function observationImagePaths(row: { imageData?: string; imageRef?: string } | null | undefined): string[] {
  if (!row) return [];
  return [...new Set(
    [row.imageData, row.imageRef].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    ),
  )];
}

export function memoryImagePaths(row: { imageRef?: string } | null | undefined): string[] {
  return row && typeof row.imageRef === "string" && row.imageRef.length > 0
    ? [row.imageRef]
    : [];
}

export async function syncImageRefs(
  kv: StateKV,
  sdk: IIIClient,
  ownerId: string,
  before: string[],
  after: string[],
): Promise<void> {
  for (const path of before) {
    if (!after.includes(path)) await releaseImageRef(kv, sdk, ownerId, path);
  }
  for (const path of after) {
    if (!before.includes(path)) await incrementImageRef(kv, path);
  }
}

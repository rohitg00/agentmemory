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

export async function unpinImageRef(kv: StateKV, filePath: string): Promise<void> {
  return withKeyedLock(`imgRef:${filePath}`, async () => {
    const current = await getImageRefCount(kv, filePath);
    if (current <= 1) await kv.delete(KV.imageRefs, filePath);
    else await kv.set(KV.imageRefs, filePath, current - 1);
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

export interface ImageRefReservation {
  readonly paths: string[];
  committed: boolean;
}

export interface ImageRefBatch {
  reserve(paths: string[]): Promise<ImageRefReservation>;
  reserveAll(pathSets: readonly string[][]): Promise<ImageRefReservation[]>;
  written(token: ImageRefReservation, beforePaths: string[]): void;
  deleted(beforePaths: string[]): void;
}

const IMAGE_REF_BATCH_CHUNK = 20;

export async function withImageRefBatch<T>(
  kv: StateKV,
  sdk: IIIClient,
  fn: (batch: ImageRefBatch) => Promise<T>,
): Promise<T> {
  const reservations: ImageRefReservation[] = [];
  const previousPaths: string[] = [];
  const batch: ImageRefBatch = {
    async reserve(paths) {
      const reservation: ImageRefReservation = { paths: [], committed: false };
      reservations.push(reservation);
      for (const path of new Set(paths)) {
        await incrementImageRef(kv, path);
        reservation.paths.push(path);
      }
      return reservation;
    },
    async reserveAll(pathSets) {
      const tokens = new Array<ImageRefReservation>(pathSets.length);
      for (let i = 0; i < pathSets.length; i += IMAGE_REF_BATCH_CHUNK) {
        const results = await Promise.allSettled(
          pathSets
            .slice(i, i + IMAGE_REF_BATCH_CHUNK)
            .map((paths, j) => batch.reserve(paths).then((token) => { tokens[i + j] = token; })),
        );
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
      }
      return tokens;
    },
    written(token, beforePaths) {
      token.committed = true;
      previousPaths.push(...beforePaths);
    },
    deleted(beforePaths) {
      previousPaths.push(...beforePaths);
    },
  };
  try {
    return await fn(batch);
  } finally {
    for (let i = 0; i < previousPaths.length; i += IMAGE_REF_BATCH_CHUNK) {
      await Promise.all(
        previousPaths
          .slice(i, i + IMAGE_REF_BATCH_CHUNK)
          .map((path) => releaseImageRef(kv, sdk, "mem::image-ref-batch", path)),
      );
    }
    const rollbackPaths = reservations
      .filter((reservation) => !reservation.committed)
      .flatMap((reservation) => reservation.paths);
    for (let i = 0; i < rollbackPaths.length; i += IMAGE_REF_BATCH_CHUNK) {
      await Promise.all(
        rollbackPaths.slice(i, i + IMAGE_REF_BATCH_CHUNK).map((path) =>
          unpinImageRef(kv, path).catch((err) => {
            logger.warn("Image reference reservation rollback failed", {
              imageRef: path,
              error: err instanceof Error ? err.message : String(err),
            });
          }),
        ),
      );
    }
  }
}

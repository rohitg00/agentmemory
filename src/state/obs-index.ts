import { KV } from "./schema.js";
import { StateKV } from "./kv.js";

const OBS_INDEX_SHARDS = 64;

function shardFor(obsId: string): number {
  let hash = 5381;
  for (let i = 0; i < obsId.length; i++) {
    hash = ((hash << 5) + hash + obsId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % OBS_INDEX_SHARDS;
}

export async function indexObservationSession(
  kv: StateKV,
  obsId: string,
  sessionId: string,
): Promise<void> {
  await kv.set(KV.obsSessionIndex(shardFor(obsId)), obsId, sessionId);
}

export async function unindexObservationSession(
  kv: StateKV,
  obsId: string,
): Promise<void> {
  await kv.delete(KV.obsSessionIndex(shardFor(obsId)), obsId);
}

export async function lookupObservationSession(
  kv: StateKV,
  obsId: string,
): Promise<string | null> {
  return kv
    .get<string>(KV.obsSessionIndex(shardFor(obsId)), obsId)
    .catch(() => null);
}

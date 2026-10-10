import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function decodeRkyvJsonScope(bytes) {
  const invalid = () => { throw new SyntaxError("Invalid rkyv 0.8 32-bit little-endian JSON scope"); };
  if (bytes.length < 8 || bytes.length % 4 !== 0) invalid();
  const root = bytes.length - 8;
  let length;
  if ((bytes[root] & 0xc0) === 0x80) {
    const encodedLength = bytes.readUInt32LE(root);
    length = (encodedLength & 0x3f) | ((encodedLength & 0xffffff00) >>> 2);
    const start = root + bytes.readInt32LE(root + 4);
    if (length <= 8 || start !== 0 || length > root || root - length > 3) invalid();
  } else {
    if (root !== 0) invalid();
    const end = bytes.indexOf(0xff);
    length = end === -1 ? 8 : end;
    if (!bytes.subarray(length).every((byte) => byte === 0xff)) invalid();
  }
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } catch {
    invalid();
  }
  const value = JSON.parse(json);
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value;
}

export function isVectorLogAcknowledged(status, count, checkpointCount) {
  const persistence = status.indexPersistence;
  const pending = count - checkpointCount;
  return status.index?.vectorDocuments === count && persistence?.saving === false &&
    persistence.pendingChanges === pending && persistence.pendingLog === pending &&
    persistence.pendingLogAcknowledged === pending && persistence.pendingLogError === null;
}

export function hasPersistedVectorFixture(dataDir, sessionId, checkpointId, pendingIds, dimensions) {
  const readScope = (scope) => decodeRkyvJsonScope(readFileSync(join(dataDir, "state_store.db", `${encodeURIComponent(scope)}.bin`)));
  const matchesVector = (row, id) => row?.id === id && row.s === sessionId &&
    typeof row.e === "string" && Buffer.from(row.e, "base64").length === dimensions * 4;
  try {
    if (readScope("mem:sessions")[sessionId]?.id !== sessionId) return false;
    const meta = readScope("mem:index:bm25")["vectors:meta"];
    if (meta?.v !== 3 || meta.count !== 1 || meta.bucketCount !== 1) return false;
    if (!matchesVector(readScope("mem:index:bm25:vec:0000")[checkpointId], checkpointId)) return false;
    const pending = readScope("mem:index:vec-pending");
    const observations = readScope(`mem:obs:${sessionId}`);
    return [checkpointId, ...pendingIds].every((id) => observations[id]?.id === id) &&
      pendingIds.every((id) => matchesVector(pending[id], id) && Number.isFinite(pending[id].q) && !pending[id].t && !pending[id].c);
  } catch (err) {
    if (err.code === "ENOENT" || err instanceof SyntaxError) return false;
    throw err;
  }
}

export function isVectorRecoverySettled(status) {
  return typeof status.index?.vectorDocuments === "number" && status.index.keywordRebuildRunning === false;
}

export function assertRecoveredVectors(status, expectedCount, embeddingInputs) {
  const index = status.index;
  assert.equal(index.vectorDocuments, expectedCount, `${index.vectorDocuments} vectors after the crash, expected ${expectedCount}`);
  assert.equal(index.pendingVectorBackfill, 0, `${index.pendingVectorBackfill} documents wait for vector backfill after the crash`);
  assert.equal(index.vectorBackfillState, "idle", `vector backfill is ${index.vectorBackfillState} after the crash`);
  assert.equal(embeddingInputs, 0, `the restart re-embedded ${embeddingInputs} inputs instead of loading saved vectors`);
}

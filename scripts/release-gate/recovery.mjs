import assert from "node:assert/strict";

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

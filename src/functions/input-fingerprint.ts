import { createHash } from "node:crypto";
import type { CompressedObservation } from "../types.js";

// Stable fingerprint of an exact observation set, used to skip LLM re-runs
// (summarize, graph extraction) when the input is unchanged. Count alone is
// not enough: evict/auto-forget can delete observations, so the set can
// change while the count returns to a previous value.
export function computeInputFingerprint(
  observations: CompressedObservation[],
): string {
  const h = createHash("sha256");
  for (const o of observations) h.update(`${o.id} ${o.timestamp} `);
  return h.digest("hex").slice(0, 32);
}

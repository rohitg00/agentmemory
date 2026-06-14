// Temporal decay for recall ranking.
//
// Memory recall in agentmemory fuses BM25, vector, and graph signals into
// a single RRF relevance score (see HybridSearch). Pure relevance has no
// notion of time: a year-old note and one written this morning rank purely
// on lexical/semantic match. Temporal decay layers a "use it or lose it"
// recency signal on top — the same principle the Generative Agents
// retrieval model and LangChain's time-weighted retriever encode — so that
// recent and reinforced memories surface ahead of stale ones of equal
// relevance, without ever fully suppressing an old-but-highly-relevant hit.
//
// Design choices (best-practice notes):
//   - Exponential decay with a configurable HALF-LIFE rather than a raw
//     decay-per-hour constant. Half-life is the interpretable knob: "after
//     N days an un-accessed memory's recency weight halves." This is the
//     standard parameterization for forgetting curves.
//   - Multiplicative reweight of the relevance score (not additive). The
//     RRF relevance score is small and unnormalized; adding a [0,1] recency
//     term would swamp it. A bounded multiplier keeps relevance the
//     dominant signal and applies decay as a graded demotion.
//   - A FLOOR on the multiplier so decay can demote but never erase. An
//     ancient memory that is the single best lexical+semantic match still
//     gets at least `floor` of its relevance, preserving recall safety.
//   - Reinforcement via last-access time ("use it or lose it"): the
//     effective age is measured from the most recent of creation or last
//     access, so retrieving a memory refreshes its recency. The caller
//     supplies the effective timestamp; this module stays pure.
//   - Importance slows decay: callers may blend a memory's importance into
//     the multiplier so consequential memories resist forgetting, matching
//     the importance term in the Generative Agents score.

export interface TemporalDecayParams {
  /** Master switch. When false, applyTemporalDecay is a no-op pass-through. */
  enabled: boolean;
  /**
   * Recency half-life in days. After this many days without access an
   * un-reinforced memory's recency factor halves. Must be > 0.
   */
  halfLifeDays: number;
  /**
   * Blend weight for the recency factor, in [0, 1]. Higher means time
   * matters more in the final multiplier.
   */
  recencyWeight: number;
  /**
   * Blend weight for normalized importance, in [0, 1]. Higher means
   * important memories resist decay more strongly. recencyWeight +
   * importanceWeight should be <= 1; the residual is the relevance-only
   * floor of the blend (time- and importance-agnostic).
   */
  importanceWeight: number;
  /**
   * Minimum multiplier, in [0, 1]. Guarantees finalScore >= floor *
   * relevance so decay never fully erases a relevant hit. Default keeps a
   * stale, unimportant memory at a fraction of its relevance rather than 0.
   */
  floor: number;
}

export const DEFAULT_TEMPORAL_DECAY: TemporalDecayParams = {
  enabled: false,
  halfLifeDays: 14,
  recencyWeight: 0.5,
  importanceWeight: 0.2,
  floor: 0.2,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Exponential recency factor in (0, 1].
 *   - 1.0 at age 0 (or negative age, e.g. clock skew),
 *   - 0.5 at exactly one half-life,
 *   - asymptotically 0 as age grows.
 *
 * `ageMs` is the elapsed time since the memory's effective timestamp
 * (creation or last access, whichever is later). A non-positive or
 * non-finite half-life disables decay (returns 1).
 */
export function recencyFactor(ageMs: number, halfLifeDays: number): number {
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 1;
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  const ageDays = ageMs / MS_PER_DAY;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Normalize the per-memory params into a guaranteed-sane shape so the
 * multiplier is provably in [floor, 1]. Weights are clamped to [0,1] and,
 * if they sum above 1, scaled down proportionally so the relevance-only
 * residual never goes negative.
 */
function normalizeParams(params: TemporalDecayParams): {
  halfLifeDays: number;
  recencyWeight: number;
  importanceWeight: number;
  floor: number;
} {
  const halfLifeDays =
    Number.isFinite(params.halfLifeDays) && params.halfLifeDays > 0
      ? params.halfLifeDays
      : DEFAULT_TEMPORAL_DECAY.halfLifeDays;
  let recencyWeight = clamp01(params.recencyWeight);
  let importanceWeight = clamp01(params.importanceWeight);
  const weightSum = recencyWeight + importanceWeight;
  if (weightSum > 1) {
    recencyWeight /= weightSum;
    importanceWeight /= weightSum;
  }
  return {
    halfLifeDays,
    recencyWeight,
    importanceWeight,
    floor: clamp01(params.floor),
  };
}

/**
 * Compute the bounded decay multiplier in [floor, 1] for a single memory.
 * Exposed for testing and for callers that want the factor without applying
 * it to a score.
 */
export function decayMultiplier(
  ageMs: number,
  importance: number,
  params: TemporalDecayParams,
): number {
  const { halfLifeDays, recencyWeight, importanceWeight, floor } =
    normalizeParams(params);
  const recency = recencyFactor(ageMs, halfLifeDays);
  const importanceNorm = clamp01(importance);
  // Relevance-only residual: the share of the blend that ignores both time
  // and importance, so a stale unimportant hit still scores on relevance.
  const baseWeight = 1 - recencyWeight - importanceWeight;
  const blend =
    baseWeight + recencyWeight * recency + importanceWeight * importanceNorm;
  // blend is in [0, 1]; lift it into [floor, 1].
  return floor + (1 - floor) * clamp01(blend);
}

/**
 * Reweight a relevance score by temporal decay. Returns the relevance
 * unchanged when decay is disabled. `nowMs` defaults to Date.now() and is a
 * parameter only so tests can pin time.
 */
export function applyTemporalDecay(
  relevance: number,
  memory: { effectiveTimestampMs: number; importance: number },
  params: TemporalDecayParams,
  nowMs: number = Date.now(),
): number {
  if (!params.enabled) return relevance;
  const ageMs = nowMs - memory.effectiveTimestampMs;
  return relevance * decayMultiplier(ageMs, memory.importance, params);
}

/**
 * Resolve a memory's effective timestamp (ms since epoch) as the later of
 * its creation/observation time and its last-access time. Reinforcement
 * (recall) refreshes recency: a frequently-retrieved old memory ages from
 * its last touch, not its birth. Invalid inputs fall back gracefully.
 */
export function effectiveTimestampMs(
  observationTimestamp: string | undefined,
  lastAccessIso?: string,
): number {
  const obsMs = observationTimestamp
    ? Date.parse(observationTimestamp)
    : NaN;
  const accessMs = lastAccessIso ? Date.parse(lastAccessIso) : NaN;
  const obs = Number.isFinite(obsMs) ? obsMs : 0;
  const access = Number.isFinite(accessMs) ? accessMs : 0;
  return Math.max(obs, access);
}

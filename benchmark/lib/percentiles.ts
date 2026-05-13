/**
 * Nearest-rank percentile over a pre-sorted ascending array of numbers.
 *
 * No dependencies, no allocation. The caller is responsible for sorting
 * the input ascending (`arr.sort((a, b) => a - b)`) — sorting in here
 * would hide an O(n log n) cost in what looks like a cheap lookup.
 *
 * @param sorted Ascending-sorted samples. Empty array returns `NaN`.
 * @param p Percentile in [0, 100]. Values outside the range are clamped.
 * @returns The sample at the nearest rank, or `NaN` for empty input.
 */
export function pXX(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const clamped = Math.max(0, Math.min(100, p));
  if (clamped === 0) return sorted[0]!;
  if (clamped === 100) return sorted[n - 1]!;
  // Nearest-rank: rank = ceil(p/100 * n), index = rank - 1.
  const rank = Math.ceil((clamped / 100) * n);
  const idx = Math.min(n - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

/**
 * Negation guard for memory dedup.
 *
 * Prevents "do X" from superseding "do not X" (and vice versa) even when
 * the two strings share enough tokens to exceed the Jaccard threshold.
 *
 * The guard is deliberately narrow and conservative:
 * - Only triggers when one side has a negation marker and the other does not.
 * - Supports English ("not", "never", "don't", "do not") and CJK
 *   ("不要", "别", "無", "なし", "않") markers.
 * - If BOTH sides have negation markers, they are treated as compatible
 *   (both say "don't do X") and the guard does not fire.
 */

const EN_NEGATION = /\b(not|never|don't|do not|cannot|should not|must not|no)\b/i;
const CJK_NEGATION = /不要|别|勿|無|无|不|なし|않|안|못/i;

function hasNegation(text: string): boolean {
  return EN_NEGATION.test(text) || CJK_NEGATION.test(text);
}

/**
 * Returns true if the two texts appear to be in a negation conflict
 * (one says do X, the other says do NOT do X) and should NOT be superseded.
 */
export function isNegationConflict(a: string, b: string): boolean {
  const aNeg = hasNegation(a);
  const bNeg = hasNegation(b);
  // If both have negation or neither does, no conflict.
  if (aNeg === bNeg) return false;
  return true;
}
// Realised consistency, docs/scoring.md §7: the mean score over the player's recent picks in a set,
// as a fraction of the 2-bit maximum. Out of sample, so honest; it can be negative, and it reads
// low while the counts are still filling.

/** How many recent picks the realised consistency averages. */
export const CONSISTENCY_WINDOW: number = 100

/** The realised consistency of scoring.md §7: mean(s) / 2 over the scores given, null if none. */
export function realisedConsistency(scores: readonly number[]): number | null {
  if (scores.length === 0) return null
  return scores.reduce((sum, s) => sum + s, 0) / scores.length / 2
}

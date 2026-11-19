// A player's ordering of a set, docs/scoring.md §6: rank the images by the row sums of the LLR
// matrix. Undecided pairs add 0, so the bottom of the order stays loose (§6).

import type { Counts, Estimator } from './scoring.ts'

/** Row sums R_i = Σ_{j≠i} L_ij over the set, scoring.md §6, highest first; ties keep the set's order. */
export function ordering(estimator: Estimator, counts: Counts, images: readonly string[]): Array<{ image: string; r: number }> {
  const rows = images.map((image, k) => ({
    image,
    k,
    r: images.reduce((sum, j, l) => (l === k ? sum : sum + estimator.llr(counts, image, j)), 0),
  }))
  rows.sort((a, b) => b.r - a.r || a.k - b.k)
  return rows.map(({ image, r }) => ({ image, r }))
}

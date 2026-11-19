// Scoring one pick, docs/scoring.md §1–§3, §5 and §9. Everything is per player × set. The caller
// passes that player's counts as they stand before the pick (§3.2, time rule), and applies
// pickUpdates only after scoring it.

/** n(winner, loser): rounds in which `winner` was picked while `loser` was shown (scoring.md §1). */
export type Counts = (winner: string, loser: string) => number

/** A pluggable source of pairwise LLRs, scoring.md §5: antisymmetric, finite, from past picks only. */
export interface Estimator {
  readonly id: string
  /** L_ij in bits. */
  llr(counts: Counts, i: string, j: string): number
}

/** L_ij = log2((n_ij + 1) / (n_ji + 1)), scoring.md §2. id 'laplace-pairwise-v1'. */
export const laplace: Estimator = {
  id: 'laplace-pairwise-v1',
  // A difference of logs rather than the log of the ratio, so that L_ji = -L_ij holds exactly.
  llr: (counts, i, j) => Math.log2(counts(i, j) + 1) - Math.log2(counts(j, i) + 1),
}

/** The three images of the quad other than the pick. */
function rivals(quad: readonly string[], x: string): string[] {
  if (quad.length !== 4 || new Set(quad).size !== 4 || !quad.includes(x)) {
    throw new Error('a quad is four distinct images, one of them the pick')
  }
  return quad.filter(j => j !== x)
}

/**
 * Σ_{y∈Q} 2^{L_yx} as 2^{M_x} · sum, with M_x = max(0, max_j L_jx) (scoring.md §4.1), so that no
 * power overflows (§9 Numerics). The y = x term is 2^{L_xx - M_x} = 2^{-M_x}.
 */
function shiftedTotal(estimator: Estimator, counts: Counts, quad: readonly string[], x: string): { m: number; sum: number } {
  const against = rivals(quad, x).map(j => estimator.llr(counts, j, x))
  const m = Math.max(0, ...against)
  return { m, sum: against.reduce((sum, l) => sum + 2 ** (l - m), 2 ** -m) }
}

/** p(x | Q), scoring.md §3.1. quad holds 4 distinct ids including x. */
export function forecast(estimator: Estimator, counts: Counts, quad: readonly string[], x: string): number {
  const { m, sum } = shiftedTotal(estimator, counts, quad, x)
  return 2 ** -m / sum
}

/** s = log2(p(x|Q) / (1/4)) bits, scoring.md §3.2, computed stably (§9 Numerics). Counts from before the pick. */
export function scorePick(estimator: Estimator, counts: Counts, quad: readonly string[], x: string): number {
  const { m, sum } = shiftedTotal(estimator, counts, quad, x)
  return 2 - m - Math.log2(sum)
}

/** The (winner, loser) pairs a pick of x from quad adds 1 to: [x, j] for each of the three rivals j. */
export function pickUpdates(quad: readonly string[], x: string): Array<[winner: string, loser: string]> {
  return rivals(quad, x).map((j): [string, string] => [x, j])
}

/** Counts from a list of (winner, loser, n) rows; pairs not listed are 0. A pair listed twice adds up. */
export function countsFrom(rows: Iterable<{ winner: string; loser: string; n: number }>): Counts {
  const table = new Map<string, Map<string, number>>()
  for (const { winner, loser, n } of rows) {
    if (!Number.isFinite(n) || n < 0) throw new Error(`a count is a non-negative number, not ${n}`)
    const row = table.get(winner) ?? new Map<string, number>()
    row.set(loser, (row.get(loser) ?? 0) + n)
    table.set(winner, row)
  }
  return (winner, loser) => table.get(winner)?.get(loser) ?? 0
}

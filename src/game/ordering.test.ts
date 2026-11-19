import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PyRandom } from '../../tools/images/lib/pyrandom.ts'
import { ordering } from './ordering.ts'
import { type Counts, countsFrom, laplace } from './scoring.ts'

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

const ids = (n: number) => Array.from({ length: n }, (_, k) => `i${k}`)

test('§6: the row sums of L, highest first, ties in the set\'s order', () => {
  // a beat b once (L_ab = 1); b beat c three times (L_bc = 2).
  const counts = countsFrom([{ winner: 'a', loser: 'b', n: 1 }, { winner: 'b', loser: 'c', n: 3 }])
  assert.deepEqual(ordering(laplace, counts, ['a', 'b', 'c', 'd']), [
    { image: 'a', r: 1 }, { image: 'b', r: 1 }, { image: 'd', r: 0 }, { image: 'c', r: -2 },
  ])
  assert.deepEqual(ordering(laplace, counts, ['d', 'c', 'b', 'a']).map(o => o.image), ['b', 'a', 'd', 'c'])
  assert.deepEqual(ordering(laplace, countsFrom([]), ['p', 'q', 'r']), [{ image: 'p', r: 0 }, { image: 'q', r: 0 }, { image: 'r', r: 0 }])
  assert.deepEqual(ordering(laplace, counts, []), [])
})

test('§6: a strength-consistent count matrix is ordered by strength, with R_i = N (log2 w_i - mean log2 w)', () => {
  const images = ids(12)
  const strengths = new PyRandom(6).shuffle(images.map((_, k) => 3 * k + 1))
  const w = new Map(images.map((image, k) => [image, strengths[k]!]))
  // n_ij + 1 = w_i against every rival, so L_ij = log2 w_i - log2 w_j: LLRs that come from strengths.
  const counts: Counts = winner => w.get(winner)! - 1
  const result = ordering(laplace, counts, images)
  assert.deepEqual(result.map(o => o.image), [...images].sort((a, b) => w.get(b)! - w.get(a)!))
  const mean = images.reduce((sum, image) => sum + Math.log2(w.get(image)!), 0) / images.length
  for (const { image, r } of result) near(r, images.length * (Math.log2(w.get(image)!) - mean))
})

test('§6 over random counts: every image once, each r its row sum, highest first, and the R_i sum to 0', () => {
  const r = new PyRandom(60)
  for (let trial = 0; trial < 60; trial++) {
    const images = r.shuffle(ids(2 + r.randbelow(40)))
    const rows = images.flatMap(winner => images.filter(loser => loser !== winner).map(loser => ({ winner, loser, n: r.randbelow(4) === 0 ? r.randbelow(50) : 0 })))
    const counts = countsFrom(rows)
    const result = ordering(laplace, counts, images)
    assert.deepEqual(result.map(o => o.image).sort(), [...images].sort())
    for (const { image, r: v } of result) near(v, images.filter(j => j !== image).reduce((sum, j) => sum + laplace.llr(counts, image, j), 0))
    for (let k = 1; k < result.length; k++) assert.ok(result[k - 1]!.r >= result[k]!.r)
    near(result.reduce((sum, o) => sum + o.r, 0), 0)
  }
})

test('ordering stays finite at counts of 1e9', () => {
  const images = ids(6)
  const result = ordering(laplace, (winner, loser) => (winner < loser ? 1e9 : 0), images)
  for (const { r } of result) assert.ok(Number.isFinite(r))
  assert.deepEqual(result.map(o => o.image), images)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PyRandom } from '../../tools/images/lib/pyrandom.ts'
import { type Counts, countsFrom, forecast, laplace, pickUpdates, scorePick } from './scoring.ts'

type Row = { winner: string; loser: string; n: number }

/** Rounded to two decimals, as the tables of docs/scoring.md print; + 0 turns -0 into 0. */
const round2 = (v: number) => Math.round(v * 100) / 100 + 0

const near = (actual: number, expected: number, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

const ids = (n: number) => Array.from({ length: n }, (_, k) => `i${k}`)

/** A count for every ordered pair: often 0, sometimes small, sometimes large. */
function randomRows(r: PyRandom, images: readonly string[]): Row[] {
  const rows: Row[] = []
  for (const winner of images) {
    for (const loser of images) {
      if (winner === loser) continue
      const scale = [0, 3, 30, 1000][r.randbelow(4)]!
      rows.push({ winner, loser, n: scale === 0 ? 0 : r.randbelow(scale) })
    }
  }
  return rows
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, k) => permutations([...items.slice(0, k), ...items.slice(k + 1)]).map(rest => [item, ...rest]))
}

test('§2: the table of L values; L is antisymmetric and 0 on the diagonal', () => {
  const table: Array<[nij: number, nji: number, l: number]> = [
    [0, 0, 0], [1, 0, 1], [3, 0, 2], [7, 0, 3], [5, 1, 1.58], [10, 0, 3.46], [100, 0, 6.66], [100, 10, 3.2],
  ]
  for (const [nij, nji, l] of table) {
    const counts = countsFrom([{ winner: 'i', loser: 'j', n: nij }, { winner: 'j', loser: 'i', n: nji }])
    assert.equal(round2(laplace.llr(counts, 'i', 'j')), l, `n_ij = ${nij}, n_ji = ${nji}`)
    assert.equal(laplace.llr(counts, 'i', 'j') + laplace.llr(counts, 'j', 'i'), 0)
    assert.equal(laplace.llr(counts, 'i', 'i'), 0)
  }
  assert.equal(laplace.id, 'laplace-pairwise-v1')
})

test('§3.3: every cell of the worked values; only the three pairs of the pick enter', () => {
  const quad = ['a', 'x', 'b', 'c']
  const rivals = ['a', 'b', 'c']
  // Pairs that the pick of x does not involve: among its rivals, and with an image outside the quad.
  const elsewhere: Row[] = [
    { winner: 'a', loser: 'b', n: 7 }, { winner: 'c', loser: 'a', n: 2 }, { winner: 'b', loser: 'c', n: 40 },
    { winner: 'x', loser: 'z', n: 5 }, { winner: 'z', loser: 'x', n: 9 }, { winner: 'z', loser: 'a', n: 3 },
  ]
  const ms = [1, 3, 10, 100]
  const rows: Array<{ row: string; counts: (m: number) => Row[]; formula: (m: number) => number; table: number[] }> = [
    { row: 'none decided', counts: () => [], formula: () => 0, table: [0, 0, 0, 0] },
    {
      row: 'beat each rival m times, never lost',
      counts: m => rivals.map(j => ({ winner: 'x', loser: j, n: m })),
      formula: m => 2 - Math.log2(1 + 3 / (m + 1)),
      table: [0.68, 1.19, 1.65, 1.96],
    },
    {
      row: 'beat one rival m times, other two pairs undecided',
      counts: m => [{ winner: 'x', loser: 'b', n: m }],
      formula: m => 2 - Math.log2(3 + 1 / (m + 1)),
      table: [0.19, 0.3, 0.37, 0.41],
    },
    {
      row: 'lost to one rival m times, other two undecided',
      counts: m => [{ winner: 'c', loser: 'x', n: m }],
      formula: m => 2 - Math.log2(m + 4),
      table: [-0.32, -0.81, -1.81, -4.7],
    },
    {
      row: 'lost to each rival m times',
      counts: m => rivals.map(j => ({ winner: j, loser: 'x', n: m })),
      formula: m => 2 - Math.log2(3 * m + 4),
      table: [-0.81, -1.7, -3.09, -6.25],
    },
  ]
  for (const { row, counts, formula, table } of rows) {
    ms.forEach((m, k) => {
      const s = scorePick(laplace, countsFrom([...elsewhere, ...counts(m)]), quad, 'x')
      assert.equal(round2(s), table[k], `${row}, m = ${m}`)
      near(s, formula(m))
    })
  }
})

test('§3.2 time rule: a first pick scores 0 from the counts before it, 0.68 from counts that already include it', () => {
  const quad = ['a', 'b', 'c', 'd']
  assert.equal(scorePick(laplace, countsFrom([]), quad, 'c'), 0)
  const after = countsFrom(pickUpdates(quad, 'c').map(([winner, loser]) => ({ winner, loser, n: 1 })))
  const s = scorePick(laplace, after, quad, 'c')
  assert.equal(round2(s), 0.68)
  near(s, 2 - Math.log2(2.5))
})

test('§4.1 over random counts: -M_x <= s <= 2 - M_x, s < 2, s >= -log2(1 + A_x/4), and s is the ratio form of §9', () => {
  const r = new PyRandom(41)
  const images = ids(8)
  for (let trial = 0; trial < 400; trial++) {
    const counts = countsFrom(randomRows(r, images))
    const quad = r.shuffle([...images]).slice(0, 4)
    for (const x of quad) {
      const others = quad.filter(j => j !== x)
      const s = scorePick(laplace, counts, quad, x)
      const m = Math.max(0, ...others.map(j => laplace.llr(counts, j, x)))
      assert.ok(-m - 1e-12 <= s && s <= 2 - m + 1e-12, `s = ${s}, M_x = ${m}`)
      assert.ok(s < 2)
      const a = others.reduce((sum, j) => sum + counts(j, x), 0)
      assert.ok(s >= -Math.log2(1 + a / 4) - 1e-12, `s = ${s}, A_x = ${a}`)
      near(s, 2 - Math.log2(1 + others.reduce((sum, j) => sum + (counts(j, x) + 1) / (counts(x, j) + 1), 0)))
    }
  }
})

test('§4.2 over random counts: the four forecasts sum to at most 1, exactly 1 when every count is 0', () => {
  const quad = ['a', 'b', 'c', 'd']
  const total = (counts: Counts, q: readonly string[]) => q.reduce((sum, x) => sum + forecast(laplace, counts, q, x), 0)
  assert.equal(total(countsFrom([]), quad), 1)
  const r = new PyRandom(42)
  const images = ids(8)
  for (let trial = 0; trial < 400; trial++) {
    const counts = countsFrom(randomRows(r, images))
    const q = r.shuffle([...images]).slice(0, 4)
    assert.ok(total(counts, q) <= 1 + 1e-12, `the forecasts sum to ${total(counts, q)}`)
    for (const x of q) near(4 * forecast(laplace, counts, q, x), 2 ** scorePick(laplace, counts, q, x))
  }
  // Counts that add up along chains (n_ij + 1 = w_i against everyone) meet the bound; a cycle falls short.
  const w: Record<string, number> = { a: 1, b: 2, c: 5, d: 9 }
  near(total(winner => w[winner]! - 1, quad), 1)
  const cycle = countsFrom([{ winner: 'a', loser: 'b', n: 5 }, { winner: 'b', loser: 'c', n: 5 }, { winner: 'c', loser: 'a', n: 5 }])
  assert.ok(total(cycle, quad) < 0.99)
})

test('§4.5: a consistent player never scores below 0, and S_T >= 2T - P log2(1 + 3T/P)', () => {
  const runs: Array<[n: number, picks: number, seed: number]> = [[10, 2000, 45], [48, 3000, 46]]
  for (const [n, picks, seed] of runs) {
    const r = new PyRandom(seed)
    const images = ids(n)
    const place = new Map(r.shuffle([...images]).map((image, k) => [image, k])) // 0 is the favourite
    const wins = new Map<string, number>()
    const counts: Counts = (winner, loser) => wins.get(`${winner} ${loser}`) ?? 0
    const p = (n * (n - 1)) / 2 - 3
    let total = 0
    for (let t = 1; t <= picks; t++) {
      const quad = r.shuffle([...images]).slice(0, 4)
      const x = quad.reduce((best, y) => (place.get(y)! < place.get(best)! ? y : best))
      const s = scorePick(laplace, counts, quad, x)
      assert.ok(s >= 0, `N = ${n}: pick ${t} scored ${s}`)
      total += s
      for (const [winner, loser] of pickUpdates(quad, x)) wins.set(`${winner} ${loser}`, counts(winner, loser) + 1)
      assert.ok(total >= 2 * t - p * Math.log2(1 + (3 * t) / p) - 1e-9, `N = ${n}: S_${t} = ${total}`)
    }
  }
})

test('no NaN or Infinity at counts of 1e9', () => {
  const quad = ['a', 'b', 'c', 'd']
  const big = 1e9
  const cases: Row[][] = [
    quad.flatMap(i => quad.filter(j => j !== i).map(j => ({ winner: i, loser: j, n: big }))),
    ['b', 'c', 'd'].map(j => ({ winner: 'a', loser: j, n: big })),
    [{ winner: 'a', loser: 'b', n: big }, { winner: 'c', loser: 'a', n: big }, { winner: 'd', loser: 'b', n: 1 }],
  ]
  const r = new PyRandom(9)
  for (let k = 0; k < 50; k++) {
    cases.push(quad.flatMap(i => quad.filter(j => j !== i).map(j => ({ winner: i, loser: j, n: [0, 1, big, r.randbelow(big)][r.randbelow(4)]! }))))
  }
  for (const rows of cases) {
    const counts = countsFrom(rows)
    let total = 0
    for (const x of quad) {
      const s = scorePick(laplace, counts, quad, x)
      const p = forecast(laplace, counts, quad, x)
      assert.ok(Number.isFinite(s) && s < 2, `s = ${s}`)
      assert.ok(Number.isFinite(p) && p > 0, `p = ${p}`)
      for (const j of quad) assert.ok(Number.isFinite(laplace.llr(counts, x, j)))
      total += p
    }
    assert.ok(total <= 1 + 1e-12)
  }
})

test('pickUpdates gives the pick over each rival; countsFrom adds repeated rows and reads 0 for pairs not listed', () => {
  assert.deepEqual(pickUpdates(['a', 'b', 'c', 'd'], 'c'), [['c', 'a'], ['c', 'b'], ['c', 'd']])
  const counts = countsFrom([{ winner: 'a', loser: 'b', n: 2 }, { winner: 'a', loser: 'b', n: 3 }, { winner: 'b', loser: 'c', n: 1 }])
  assert.equal(counts('a', 'b'), 5)
  assert.equal(counts('b', 'a'), 0)
  assert.equal(counts('b', 'c'), 1)
  assert.equal(counts('z', 'a'), 0)
  assert.throws(() => countsFrom([{ winner: 'a', loser: 'b', n: -1 }]), /non-negative/)
  assert.throws(() => countsFrom([{ winner: 'a', loser: 'b', n: Number.NaN }]), /non-negative/)
})

test('a quad is four distinct images including the pick, and its screen order does not change the score', () => {
  const counts = countsFrom([{ winner: 'a', loser: 'b', n: 4 }, { winner: 'c', loser: 'a', n: 1 }, { winner: 'a', loser: 'd', n: 2 }])
  for (const bad of [['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'c'], ['b', 'c', 'd', 'e']]) {
    assert.throws(() => scorePick(laplace, counts, bad, 'a'), /four distinct/)
    assert.throws(() => forecast(laplace, counts, bad, 'a'), /four distinct/)
    assert.throws(() => pickUpdates(bad, 'a'), /four distinct/)
  }
  const s = scorePick(laplace, counts, ['a', 'b', 'c', 'd'], 'a')
  for (const order of permutations(['a', 'b', 'c', 'd'])) near(scorePick(laplace, counts, order, 'a'), s)
})

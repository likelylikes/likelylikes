import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PyRandom } from '../../tools/images/lib/pyrandom.ts'
import { cryptoRandomInt, shuffle, uniformSelector } from './selection.ts'

// Counts are checked against loose bounds (6 to 9 standard deviations), so the tests that draw from
// crypto never fail by chance, and the seeded ones would not either under another seed.

const ids = (n: number) => Array.from({ length: n }, (_, k) => `i${k}`)

function seeded(seed: number) {
  const r = new PyRandom(seed)
  return (n: number) => r.randbelow(n)
}

const add = (tally: Map<string, number>, key: string) => tally.set(key, (tally.get(key) ?? 0) + 1)

function aboutEvenly(tally: Map<string, number>, cells: number, expected: number, fraction: number) {
  assert.equal(tally.size, cells)
  for (const [key, n] of tally) assert.ok(Math.abs(n - expected) <= fraction * expected, `${key}: ${n}, expected about ${expected}`)
}

test('cryptoRandomInt stays in range, and refuses n < 1, a non-integer or n above 2^32', () => {
  for (const n of [1, 2, 3, 4, 7, 48, 1000, 2 ** 31 + 1, 2 ** 32 - 1, 2 ** 32]) {
    for (let k = 0; k < 200; k++) {
      const v = cryptoRandomInt(n)
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `cryptoRandomInt(${n}) gave ${v}`)
    }
  }
  for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32 + 1]) assert.throws(() => cryptoRandomInt(n), RangeError)
})

test('cryptoRandomInt is unbiased where a plain remainder would not be', () => {
  // n = 3 · 2^30: a 32-bit word mod n lands in the first third half the time; rejection makes it a third.
  const n = 3 * 2 ** 30
  const thirds = new Map<string, number>()
  for (let k = 0; k < 6000; k++) add(thirds, String(Math.floor(cryptoRandomInt(n) / 2 ** 30)))
  aboutEvenly(thirds, 3, 2000, 0.15)
})

test('uniformSelector draws four distinct images of the set', () => {
  const random = seeded(1)
  const images = ids(48)
  for (let k = 0; k < 2000; k++) {
    const quad = uniformSelector.select(images, random)
    assert.equal(quad.length, 4)
    assert.equal(new Set(quad).size, 4)
    for (const image of quad) assert.ok(images.includes(image))
  }
  assert.deepEqual(uniformSelector.select(ids(4), random).sort(), ids(4))
  assert.equal(uniformSelector.id, 'uniform-v1')
})

test('uniformSelector refuses a set of fewer than four images, or one that lists an image twice', () => {
  const random = seeded(2)
  for (const n of [0, 1, 2, 3]) assert.throws(() => uniformSelector.select(ids(n), random), /needs 4 images/)
  assert.throws(() => uniformSelector.select(['a', 'b', 'c', 'd', 'a'], random), /twice/)
})

test('uniformSelector shows every image about equally often, and every four of a small set', () => {
  const random = seeded(3)
  const seen = new Map<string, number>()
  for (let k = 0; k < 24000; k++) for (const image of uniformSelector.select(ids(48), random)) add(seen, image)
  aboutEvenly(seen, 48, 2000, 0.15)
  const fours = new Map<string, number>()
  for (let k = 0; k < 15000; k++) add(fours, uniformSelector.select(ids(6), random).sort().join(' '))
  aboutEvenly(fours, 15, 1000, 0.2)
})

test('shuffle is Fisher–Yates: a new array, in the order Python\'s random.shuffle gives', () => {
  const items = ids(48)
  const r = new PyRandom(20261118)
  const out = shuffle(items, n => r.randbelow(n))
  assert.deepEqual(items, ids(48))
  assert.notEqual(out, items)
  assert.deepEqual(out, new PyRandom(20261118).shuffle(ids(48)))
  assert.deepEqual(shuffle([], () => 0), [])
  assert.deepEqual(shuffle(['only'], () => 0), ['only'])
  assert.throws(() => shuffle(['a', 'b', 'c'], () => 3), RangeError)
  assert.throws(() => shuffle(['a', 'b', 'c'], () => 0.5), RangeError)
})

test('shuffle gives each of the 24 orders of four items about equally often', () => {
  const random = seeded(4)
  const orders = new Map<string, number>()
  for (let k = 0; k < 24000; k++) add(orders, shuffle(['a', 'b', 'c', 'd'], random).join(''))
  aboutEvenly(orders, 24, 1000, 0.2)
})

test('the screen order the server draws from cryptoRandomInt: four distinct images, each image in each position about equally often', () => {
  const images = ids(8)
  const cells = new Map<string, number>()
  for (let k = 0; k < 8000; k++) {
    const screen = shuffle(uniformSelector.select(images, cryptoRandomInt), cryptoRandomInt)
    assert.equal(new Set(screen).size, 4)
    screen.forEach((image, position) => add(cells, `${image} at ${position}`))
  }
  aboutEvenly(cells, 32, 1000, 0.25)
})

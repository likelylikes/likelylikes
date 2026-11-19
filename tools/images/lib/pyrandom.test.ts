import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PyRandom } from './pyrandom.ts'

// Expected values printed by CPython 3.12.3's random module.

test('getrandbits(32) matches CPython', () => {
  const r = new PyRandom(20261118)
  assert.deepEqual([1, 2, 3, 4, 5].map(() => r.getrandbits(32)), [3870890365, 2818099316, 3567785002, 875129475, 1472668588])
  const z = new PyRandom(0)
  assert.deepEqual([1, 2, 3].map(() => z.getrandbits(32)), [3626764237, 1654615998, 3255389356])
  const max = new PyRandom(4294967295)
  assert.deepEqual([1, 2].map(() => max.getrandbits(32)), [2728839433, 2661025012])
})

test('shuffle matches CPython', () => {
  const xs = Array.from({ length: 48 }, (_, i) => i)
  new PyRandom(20261118).shuffle(xs)
  assert.deepEqual(xs, [42, 9, 45, 37, 5, 35, 33, 36, 39, 28, 43, 17, 30, 26, 19, 15, 25, 7, 40, 22, 44, 12, 29, 16, 18, 32, 38, 11, 8, 6, 34, 23, 3, 47, 0, 46, 10, 27, 31, 20, 24, 14, 1, 2, 4, 21, 13, 41])
  const big = Array.from({ length: 10 }, (_, i) => i)
  new PyRandom(2n ** 40n + 12345n).shuffle(big)
  assert.deepEqual(big, [3, 2, 6, 8, 7, 9, 0, 1, 5, 4])
  const many = Array.from({ length: 1000 }, (_, i) => i)
  new PyRandom(7).shuffle(many)
  assert.deepEqual(many.slice(0, 10), [878, 857, 349, 313, 382, 850, 927, 194, 261, 946])
})

test('negative seeds seed like their absolute value, as in Python', () => {
  assert.equal(new PyRandom(-7).getrandbits(32), new PyRandom(7).getrandbits(32))
})

test('randbelow stays in range', () => {
  const r = new PyRandom(1)
  for (let n = 1; n < 200; n++) {
    const v = r.randbelow(n)
    assert.ok(v >= 0 && v < n)
  }
  assert.throws(() => r.randbelow(0))
  assert.throws(() => new PyRandom(1.5))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ImageRecord, Template } from './records.ts'
import { consider, freeParameters, matchesFilter, selectFrom } from './select.ts'

const t = {
  id: 'x', version: 1, question: '', prompt: '{ethnicity} {age}',
  parameters: { ethnicity: { a: 'A', b: 'B', c: 'C' }, age: { '25': '25', '30': '30' } },
  exclusions: [], tags: {}, model: { provider: 'p', id: 'm', version: null }, settings: {},
  served: { width: 640, height: 640, format: 'webp', quality: 85 },
} satisfies Template

function images(spec: Array<[string, string, number]>, prefix = 'h'): ImageRecord[] {
  let k = 0
  return spec.flatMap(([ethnicity, age, count]) => Array.from({ length: count }, () => {
    k++
    return {
      sha256: `${prefix}${String(k).padStart(3, '0')}`, original: 'o', template: 'x', version: 1, subject: `s${String(k).padStart(3, '0')}`,
      candidate: 1, values: { ethnicity, age }, tags: {}, width: 640, height: 640, format: 'webp', bytes: 1, quality: 85,
      encoder: 'e', encoder_version: 'v', signed: false, time: '',
    }
  }))
}

const tally = (pool: ImageRecord[], chosen: string[], name: string) => {
  const out: Record<string, number> = {}
  for (const h of chosen) {
    const v = pool.find(i => i.sha256 === h)!.values[name]!
    out[v] = (out[v] ?? 0) + 1
  }
  return out
}

test('spreads the set evenly over the free parameters', () => {
  const pool = images([['a', '25', 5], ['a', '30', 5], ['b', '25', 5], ['b', '30', 5], ['c', '25', 5], ['c', '30', 5]])
  const chosen = selectFrom(t, consider(pool, new Set(), {}), {}, 12, 1)
  assert.equal(new Set(chosen).size, 12)
  assert.deepEqual(tally(pool, chosen, 'ethnicity'), { a: 4, b: 4, c: 4 })
  assert.deepEqual(tally(pool, chosen, 'age'), { '25': 6, '30': 6 })
})

test('takes all of a scarce value and spreads the rest', () => {
  const pool = images([['a', '25', 2], ['b', '25', 10], ['c', '25', 10]])
  const chosen = selectFrom(t, consider(pool, new Set(), {}), {}, 12, 7)
  assert.deepEqual(tally(pool, chosen, 'ethnicity'), { a: 2, b: 5, c: 5 })
})

test('the same seed reproduces the selection; a filter and withdrawals narrow what is considered', () => {
  const pool = images([['a', '25', 10], ['b', '25', 10], ['c', '30', 10]])
  const filter = { ethnicity: ['a', 'b'] }
  const considered = consider(pool, new Set(), filter)
  assert.equal(considered.length, 20)
  const once = selectFrom(t, considered, filter, 12, 42)
  assert.deepEqual(selectFrom(t, considered, filter, 12, 42), once)
  assert.deepEqual(tally(pool, once, 'ethnicity'), { a: 6, b: 6 })
  assert.ok(!consider(pool, new Set([once[0]!]), filter).some(i => i.sha256 === once[0]))
})

test('a recorded considered list reproduces the set however the pool changes after', () => {
  const pool = images([['a', '25', 8], ['b', '25', 8]])
  const considered = consider(pool, new Set(), {})
  const before = selectFrom(t, considered, {}, 12, 3)
  // Later: more images, a withdrawal, and the log in another order. The set re-runs on what it recorded.
  const later = [...images([['c', '25', 6]], 'new'), ...pool].reverse()
  const recorded = considered.map(i => later.find(x => x.sha256 === i.sha256)!)
  assert.deepEqual(selectFrom(t, recorded, {}, 12, 3), before)
})

test('refuses when too few images match, and knows which parameters are free', () => {
  const pool = images([['a', '25', 5]])
  assert.throws(() => selectFrom(t, consider(pool, new Set(), {}), {}, 12, 1), /fewer than N/)
  assert.deepEqual(freeParameters(t, { age: ['25'] }), ['ethnicity'])
  assert.deepEqual(freeParameters(t, { age: ['25', '30'] }), ['ethnicity', 'age'])
  assert.equal(matchesFilter({ ethnicity: 'a' }, { toString: ['a'] }), false)
})

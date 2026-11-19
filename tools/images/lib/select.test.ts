import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ImageRecord, Template } from './records.ts'
import { freeParameters, selectImages } from './select.ts'

const t = {
  id: 'x', version: 1, question: '', prompt: '{ethnicity} {age}',
  parameters: { ethnicity: { a: 'A', b: 'B', c: 'C' }, age: { '25': '25', '30': '30' } },
  exclusions: [], tags: {}, model: { provider: 'p', id: 'm', version: null }, settings: {},
  served: { width: 640, height: 640, format: 'webp', quality: 85 },
} satisfies Template

function images(spec: Array<[string, string, number]>): ImageRecord[] {
  let k = 0
  return spec.flatMap(([ethnicity, age, count]) => Array.from({ length: count }, () => {
    k++
    return {
      sha256: `h${String(k).padStart(3, '0')}`, original: 'o', template: 'x', version: 1, subject: `s${String(k).padStart(3, '0')}`,
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
  const chosen = selectImages(t, pool, pool.length, new Set(), {}, 12, 1)
  assert.equal(new Set(chosen).size, 12)
  assert.deepEqual(tally(pool, chosen, 'ethnicity'), { a: 4, b: 4, c: 4 })
  assert.deepEqual(tally(pool, chosen, 'age'), { '25': 6, '30': 6 })
})

test('takes all of a scarce value and spreads the rest', () => {
  const pool = images([['a', '25', 2], ['b', '25', 10], ['c', '25', 10]])
  const chosen = selectImages(t, pool, pool.length, new Set(), {}, 12, 7)
  assert.deepEqual(tally(pool, chosen, 'ethnicity'), { a: 2, b: 5, c: 5 })
})

test('the same seed reproduces the selection; a filter and withdrawals narrow it', () => {
  const pool = images([['a', '25', 10], ['b', '25', 10], ['c', '30', 10]])
  const once = selectImages(t, pool, pool.length, new Set(), { ethnicity: ['a', 'b'] }, 12, 42)
  assert.deepEqual(selectImages(t, pool, pool.length, new Set(), { ethnicity: ['a', 'b'] }, 12, 42), once)
  assert.deepEqual(tally(pool, once, 'ethnicity'), { a: 6, b: 6 })
  const withdrawn = new Set([once[0]!])
  assert.ok(!selectImages(t, pool, pool.length, withdrawn, { ethnicity: ['a', 'b'] }, 12, 42).includes(once[0]!))
})

test('only the first pool_images records count, so a growing pool keeps old sets reproducible', () => {
  const pool = images([['a', '25', 6], ['b', '25', 6]])
  const before = selectImages(t, pool, pool.length, new Set(), {}, 12, 3)
  const grown = [...pool, ...images([['c', '25', 6]]).map(i => ({ ...i, sha256: 'new' + i.sha256 }))]
  assert.deepEqual(selectImages(t, grown, pool.length, new Set(), {}, 12, 3), before)
})

test('refuses when too few images match, and knows which parameters are free', () => {
  const pool = images([['a', '25', 5]])
  assert.throws(() => selectImages(t, pool, pool.length, new Set(), {}, 12, 1), /fewer than N/)
  assert.throws(() => selectImages(t, pool, 99, new Set(), {}, 1, 1), /considers 99/)
  assert.deepEqual(freeParameters(t, { age: ['25'] }), ['ethnicity'])
  assert.deepEqual(freeParameters(t, { age: ['25', '30'] }), ['ethnicity', 'age'])
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONSISTENCY_WINDOW, realisedConsistency } from './consistency.ts'

test('§7: realised consistency is null before the first pick', () => {
  assert.equal(realisedConsistency([]), null)
})

test('§7: realised consistency is the mean score over 2, and can be negative', () => {
  assert.equal(realisedConsistency([2]), 1)
  assert.equal(realisedConsistency([0, 2]), 0.5)
  assert.equal(realisedConsistency([0, 0, 0]), 0)
  assert.equal(realisedConsistency([-1, -3]), -1)
  const mixed = realisedConsistency([0.68, -0.32, 1.19])
  assert.ok(mixed !== null && Math.abs(mixed - (0.68 - 0.32 + 1.19) / 3 / 2) < 1e-12)
  assert.equal(CONSISTENCY_WINDOW, 100)
})

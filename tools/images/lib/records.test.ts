import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPO, cellCrop, cellOf, listPools, loadTemplate, normalisePrompt, renderPrompt, templateProblems, type Template } from './records.ts'
import { testTemplate } from './testing.ts'

test('every committed template is sound', () => {
  for (const pool of listPools(REPO)) assert.doesNotThrow(() => loadTemplate(REPO, pool), pool)
})

test('a template with a non-square served size, a stray slot, a slotless parameter or a shared fragment is refused', () => {
  const problems = (t: Partial<Template>) => templateProblems({ ...testTemplate, ...t } as Template)
  assert.deepEqual(problems({}), [])
  assert.match(problems({ served: { width: 48, height: 32, format: 'webp', quality: 80 } }).join(), /not square/)
  assert.match(problems({ prompt: 'Sixteen {colour} squares of {age}-year-old grey, {size}.' }).join(), /slot \{size\} is not a parameter/)
  assert.match(problems({ prompt: 'Sixteen squares of {age}-year-old grey.' }).join(), /parameter colour has no slot/)
  assert.match(problems({ parameters: { colour: { red: 'red', crimson: 'red' }, age: { '30': '30' } } }).join(), /two values share a fragment/)
})

test('prompts and values must be own properties, not Object.prototype\'s', () => {
  assert.throws(() => renderPrompt(testTemplate, { colour: 'toString', age: '30' }), /no value toString/)
  assert.throws(() => renderPrompt({ ...testTemplate, prompt: '{constructor}' }, {}), /unknown slot/)
})

test('a cell\'s crop and the cell it came from agree, on grids that divide their sheet and ones that do not', () => {
  for (const [w, n] of [[4096, 4], [4096, 3], [4096, 5], [403, 6]] as const) {
    for (let row = 1; row <= n; row++) {
      for (let column = 1; column <= n; column++) {
        const crop = cellCrop(w, w, n, n, row, column)
        assert.equal(crop.width, Math.floor(w / n))
        assert.ok(crop.x + crop.width <= w && crop.y + crop.height <= w, `${w}/${n} r${row}c${column} stays on the sheet`)
        assert.deepEqual(cellOf(crop, w, w, n, n), { row, column })
      }
    }
  }
  assert.deepEqual(cellCrop(4096, 4096, 4, 4, 2, 3), { x: 2048, y: 1024, width: 1024, height: 1024 })
})

test('prompt normalisation folds what a paste changes and nothing else', () => {
  assert.equal(normalisePrompt('﻿A  “quoted” word — it’s\r\nhere​. '), 'A "quoted" word - it\'s here.')
  assert.notEqual(normalisePrompt('red'), normalisePrompt('blue'))
})

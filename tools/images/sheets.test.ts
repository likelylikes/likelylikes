import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO, loadTemplate, paths, readJson, readJsonl, type Design, type Generation, type Subject } from './lib/records.ts'
import { testTemplate } from './lib/testing.ts'
import { inspectSheet, plan, valuesForPrompt, write } from './sheets.ts'

test('the prompt as typed picks the values, whitespace aside', () => {
  assert.deepEqual(valuesForPrompt(testTemplate, '  Sixteen blue squares of\n30-year-old   grey, in a 4x4 grid. '), { colour: 'blue', age: '30' })
})

test('a prompt that is not the template\'s names the first difference', () => {
  assert.throws(() => valuesForPrompt(testTemplate, 'Sixteen green squares of 30-year-old grey, in a 4x4 grid.'), /first difference at character 8/)
  const loose = { ...testTemplate, prompt: 'Sixteen squares of {age}-year-old grey, in a 4x4 grid.' }
  assert.throws(() => valuesForPrompt(loose, 'Sixteen squares of 30-year-old grey, in a 4x4 grid.'), /no value|matches 2/)
})

test('re-ingesting the committed sheets reproduces the committed records byte for byte', async () => {
  const pool = 'women-profiles.v1'
  const root = mkdtempSync(join(tmpdir(), 'likelylikes-reingest-'))
  try {
    const real = paths(REPO, pool)
    const scratch = paths(root, pool)
    mkdirSync(scratch.dir, { recursive: true })
    mkdirSync(join(root, 'images', 'templates'), { recursive: true })
    cpSync(real.template, scratch.template)
    cpSync(real.design, scratch.design)
    const t = loadTemplate(root, pool)
    // Given in a different order from generation order: the step sorts by time-stamp.
    const incoming = []
    for (const g of ['g03', 'g01', 'g02']) incoming.push(await inspectSheet(t, join(real.sheets, `${g}.jpg`)))
    const p = plan(t, readJson<Design>(scratch.design), [], [], incoming, 'browser download')
    write(root, pool, p)
    for (const f of ['subjects', 'generations'] as const) assert.equal(readFileSync(scratch[f], 'utf8'), readFileSync(real[f], 'utf8'), f)
    for (const g of ['g01', 'g02', 'g03']) {
      assert.ok(readFileSync(join(scratch.sheets, `${g}.jpg`)).equals(readFileSync(join(real.sheets, `${g}.jpg`))), g)
      assert.ok(readFileSync(join(scratch.sheets, `${g}.md`)).equals(readFileSync(join(real.sheets, `${g}.md`))), g)
    }
    // Run again: every sheet is already there.
    const again = plan(t, readJson<Design>(scratch.design), readJsonl<Subject>(scratch.subjects), readJsonl<Generation>(scratch.generations), incoming, 'browser download')
    assert.equal(again.sheets.length, 0)
    assert.deepEqual(again.skipped.map(s => s.sheet).sort(), ['g01', 'g02', 'g03'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { check } from './check.ts'
import {
  REPO, appendJsonl, loadDesign, loadTemplate, paths, readJson, readJsonl, subjectNumber,
  type Design, type Generation, type Subject,
} from './lib/records.ts'
import { TEST_POOL, scratchRepo, syntheticSheet, testTemplate } from './lib/testing.ts'
import { c2paTimestamp } from './lib/timestamp.ts'
import { ingest, inspectSheet, parseTime, plan, valuesForPrompt } from './sheets.ts'

const scratch: string[] = []
after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

async function repo() {
  const r = await scratchRepo()
  scratch.push(r.root)
  return r
}

test('the prompt as typed picks the values, whatever an editor did to its spacing, quotes or encoding', () => {
  assert.deepEqual(valuesForPrompt(testTemplate, '﻿  Sixteen blue squares of\r\n30-year-old   grey, in a 4x4 grid. '), { colour: 'blue', age: '30' })
  const quoted = { ...testTemplate, prompt: "{colour}'s \"grey\" squares - {age}" }
  assert.deepEqual(valuesForPrompt(quoted, '“red’s “grey” squares – 30'.slice(1)), { colour: 'red', age: '30' })
  const accented = { ...testTemplate, parameters: { colour: { sami: 'Sámi', red: 'red' }, age: { '30': '30' } } }
  assert.deepEqual(valuesForPrompt(accented, 'Sixteen Sámi squares of 30-year-old grey, in a 4x4 grid.'), { colour: 'sami', age: '30' })
})

test('a prompt that is not the template\'s names the first difference, escaping what cannot be seen', () => {
  assert.throws(() => valuesForPrompt(testTemplate, 'Sixteen green squares of 30-year-old grey, in a 4x4 grid.'), /first difference at character 8/)
  assert.throws(() => valuesForPrompt(testTemplate, 'Sixteen red squares of 30-year-old gréy, in a 4x4 grid.'), /\\u00e9/)
  const loose = { ...testTemplate, prompt: 'Sixteen squares of {age}-year-old grey, in a 4x4 grid.' }
  assert.throws(() => valuesForPrompt(loose, 'Sixteen squares of 30-year-old grey, in a 4x4 grid.'), /matches 2/)
})

test('--time needs a zone and a real calendar time, and is written to the second, in UTC', () => {
  assert.equal(parseTime('2026-11-02T08:21:09.7+01:00'), '2026-11-02T07:21:09+00:00')
  assert.equal(parseTime('2026-11-02T07:21Z'), '2026-11-02T07:21:00+00:00')
  assert.throws(() => parseTime('2026-11-02T07:21:09'), /zone/)
  assert.throws(() => parseTime('November 2'), /zone/)
  assert.throws(() => parseTime('2026-02-30T00:00:00Z'), /calendar/)
  assert.throws(() => parseTime('2026-11-02T24:00:00Z'), /calendar/)
})

/**
 * The batches a sheet pool's sheets were added in: each run numbers its subjects after the last and
 * shuffles them together, so a batch is the shortest run of subjects, in ID order, covering whole sheets.
 */
function batches(subjects: Subject[], cellsPerSheet: number): string[][] {
  const out: string[][] = []
  let sheets = new Set<string>()
  let count = 0
  for (const s of [...subjects].sort((a, b) => subjectNumber(a.subject) - subjectNumber(b.subject))) {
    sheets.add(s.sheet!)
    count++
    if (count === sheets.size * cellsPerSheet) {
      out.push([...sheets])
      sheets = new Set()
      count = 0
    }
  }
  assert.equal(count, 0, 'every batch covers whole sheets')
  return out
}

test('re-ingesting the committed sheets, batch by batch, reproduces the committed records byte for byte', async () => {
  const pool = 'women-profiles.v1'
  const root = mkdtempSync(join(tmpdir(), 'likelylikes-reingest-'))
  scratch.push(root)
  const real = paths(REPO, pool)
  const copy = paths(root, pool)
  mkdirSync(copy.dir, { recursive: true })
  mkdirSync(join(root, 'images', 'templates'), { recursive: true })
  cpSync(real.template, copy.template)
  cpSync(real.design, copy.design)
  const t = loadTemplate(REPO, pool)
  const generations = readJsonl<Generation>(real.generations)
  const file = (sheet: string) => {
    const g = generations.find(x => x.sheet === sheet)!
    return { path: join(real.sheets, `${sheet}.${g.format === 'jpeg' ? 'jpg' : g.format}`), g }
  }
  for (const batch of batches(readJsonl<Subject>(real.subjects), t.sheet!.rows * t.sheet!.columns)) {
    // Given in reverse order, with a prompt file among them: the step sorts by time and skips prompt files.
    const sheets = batch.map(file).reverse()
    const unstamped = sheets.filter(s => c2paTimestamp(readFileSync(s.path)) === null)
    const report = await ingest(root, pool, [...sheets.map(s => s.path), sheets[0]!.path.replace(/\.[a-z]+$/, '.md')], {
      time: unstamped[0]?.g.time, via: sheets[0]!.g.via,
    })
    assert.equal(report.ignored.length, 1)
  }
  for (const f of ['subjects', 'generations', 'design'] as const) assert.equal(readFileSync(copy[f], 'utf8'), readFileSync(real[f], 'utf8'), f)
  for (const sheet of new Set(generations.map(g => g.sheet!))) {
    const { path } = file(sheet)
    const name = path.slice(real.sheets.length + 1)
    assert.ok(readFileSync(join(copy.sheets, name)).equals(readFileSync(path)), name)
    assert.ok(readFileSync(join(copy.sheets, `${sheet}.md`)).equals(readFileSync(join(real.sheets, `${sheet}.md`))), `${sheet}.md`)
  }
})

test('a sheet ingested with --time is skipped on a re-run, the same command included, and folders are passed over', async () => {
  const { root, inbox } = await repo()
  await ingest(root, TEST_POOL, [inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  const same = await ingest(root, TEST_POOL, [inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  assert.equal(same.skipped.length, 1)
  const report = await ingest(root, TEST_POOL, [inbox[0]!, inbox[1]!], { time: '2026-11-01T11:00:00Z' })
  assert.equal(report.skipped.length, 1)
  assert.equal(report.plan.sheets.length, 1)
  mkdirSync(join(root, 'inbox', 'old'))
  const again = await ingest(root, TEST_POOL, [inbox[0]!, inbox[1]!, join(root, 'inbox', 'old')])
  assert.equal(again.skipped.length, 2)
  assert.deepEqual(again.ignored, [join(root, 'inbox', 'old')])
  assert.equal(again.plan.sheets.length, 0)
})

test('a run cut short after its generations were logged is finished by the next run', async () => {
  const { root, inbox } = await repo()
  const files = paths(root, TEST_POOL)
  const t = loadTemplate(root, TEST_POOL)
  // What a run stopped between its two appends leaves: the sheet files and generations, no subjects.
  const fresh = await inspectSheet(t, inbox[0]!, readFileSync(inbox[0]!), '2026-11-01T10:00:00Z')
  const pl = plan(t, loadDesign(root, TEST_POOL, t), [], [], [fresh], 'browser download')
  mkdirSync(files.sheets, { recursive: true })
  writeFileSync(join(files.sheets, 'g01.png'), fresh.bytes)
  writeFileSync(join(files.sheets, 'g01.md'), readFileSync(fresh.promptFile))
  appendJsonl(files.generations, pl.generations)
  const dry = await ingest(root, TEST_POOL, [inbox[0]!, inbox[1]!], { dryRun: true, time: '2026-11-01T11:00:00Z' })
  assert.equal(dry.completed.length, 16)
  assert.equal(readJsonl<Subject>(files.subjects).length, 0, 'a dry run writes nothing')
  const report = await ingest(root, TEST_POOL, [inbox[0]!, inbox[1]!], { time: '2026-11-01T11:00:00Z' })
  assert.equal(report.completed.length, 16)
  assert.deepEqual(readJsonl<Subject>(files.subjects).slice(0, 16), pl.subjects)
  assert.equal(readJsonl<Subject>(files.subjects).length, 32)
  const { problems } = await check(root)
  assert.deepEqual(problems.filter(p => p.where === TEST_POOL && p.rule !== 'images'), [])
})

test('a dry run refuses, as a real one would, a sheet file already there with other bytes', async () => {
  const { root, inbox } = await repo()
  mkdirSync(paths(root, TEST_POOL).sheets, { recursive: true })
  writeFileSync(join(paths(root, TEST_POOL).sheets, 'g01.png'), 'something else')
  await assert.rejects(ingest(root, TEST_POOL, [inbox[0]!], { time: '2026-11-01T10:00:00Z', dryRun: true }), /exists with other content/)
})

test('a sheet of another size, a rotated one, or a grid off by a pixel is refused before anything is written', async () => {
  const { root, inbox } = await repo()
  await ingest(root, TEST_POOL, [inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  const dir = join(root, 'inbox')
  const big = join(dir, 'big.png')
  writeFileSync(big, await syntheticSheet({ width: 320, height: 320, rows: 4, columns: 4, seed: 3 }))
  writeFileSync(join(dir, 'big.md'), 'Sixteen blue squares of 30-year-old grey, in a 4x4 grid.')
  await assert.rejects(ingest(root, TEST_POOL, [big], { time: '2026-11-01T11:00:00Z' }), /big\.png: 320x320, but the pool's sheets are 256x256/)
  const turned = join(dir, 'turned.jpg')
  writeFileSync(turned, await sharp(await syntheticSheet({ width: 256, height: 256, rows: 4, columns: 4, seed: 4 })).jpeg().withMetadata({ orientation: 6 }).toBuffer())
  writeFileSync(join(dir, 'turned.md'), 'Sixteen blue squares of 30-year-old grey, in a 4x4 grid.')
  await assert.rejects(ingest(root, TEST_POOL, [turned], { time: '2026-11-01T11:00:00Z' }), /turned\.jpg: EXIF orientation 6/)
  const off = join(dir, 'off.png')
  writeFileSync(off, await syntheticSheet({ width: 256, height: 256, rows: 4, columns: 4, seed: 5, shift: 1 }))
  writeFileSync(join(dir, 'off.md'), 'Sixteen blue squares of 30-year-old grey, in a 4x4 grid.')
  await assert.rejects(ingest(root, TEST_POOL, [off], { time: '2026-11-01T11:00:00Z' }), /off\.png: cells are not on the 4x4 grid lines/)
  assert.equal(readJsonl<Subject>(paths(root, TEST_POOL).subjects).length, 16)
})

test('the design\'s per_value rises to the subjects the pool holds', async () => {
  const design: Design = { template: 'test-sheets', version: 1, stratify: 'colour', per_value: {}, balance: [], seed: 1 }
  const r = await scratchRepo(testTemplate, design)
  scratch.push(r.root)
  const report = await ingest(r.root, TEST_POOL, [r.inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  assert.deepEqual(report.plan.perValue, { red: 16 })
  assert.deepEqual(readJson<Design>(paths(r.root, TEST_POOL).design).per_value, { red: 16 })
})

test('a 3x3 grid on a sheet it does not divide is ingested, with the inset covering the rounding', async () => {
  const template = { ...testTemplate, id: 'test-nine', prompt: 'Nine {colour} squares of {age}-year-old grey.', sheet: { rows: 3, columns: 3, inset: 2 } }
  const design: Design = { template: 'test-nine', version: 1, stratify: 'colour', per_value: {}, balance: [], seed: 1 }
  const r = await scratchRepo(template, design)
  scratch.push(r.root)
  const file = join(r.root, 'inbox', 'nine.png')
  writeFileSync(file, await syntheticSheet({ width: 200, height: 200, rows: 3, columns: 3, seed: 8 }))
  writeFileSync(join(r.root, 'inbox', 'nine.md'), 'Nine red squares of 30-year-old grey.')
  const report = await ingest(r.root, 'test-nine.v1', [file], { time: '2026-11-01T10:00:00Z' })
  const crops = report.plan.generations.map(g => g.crop!)
  assert.equal(crops.length, 9)
  assert.ok(crops.every(c => c.width === 66 && c.height === 66))
  assert.deepEqual([...new Set(crops.map(c => c.x))].sort((a, b) => a - b), [0, 67, 133])
  const tooThin = { ...template, sheet: { rows: 3, columns: 3, inset: 1 } }
  const r2 = await scratchRepo(tooThin, design)
  scratch.push(r2.root)
  const file2 = join(r2.root, 'inbox', 'nine.png')
  writeFileSync(file2, readFileSync(file))
  writeFileSync(join(r2.root, 'inbox', 'nine.md'), 'Nine red squares of 30-year-old grey.')
  await assert.rejects(ingest(r2.root, 'test-nine.v1', [file2], { time: '2026-11-01T10:00:00Z' }), /inset must be at least 2/)
})

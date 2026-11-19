// End to end on a synthetic pool: sheets, accept, encode, freeze, check; then corruptions the check must catch.

import assert from 'node:assert/strict'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { bulkAccepts } from './accept.ts'
import { check } from './check.ts'
import { encodePool } from './encode.ts'
import { freezeSet } from './freeze.ts'
import {
  appendJsonl, jsonLine, loadTemplate, paths, readJson, readJsonl, setsDir,
  type Decision, type Design, type Generation, type ImageRecord, type SetRecord, type Subject,
} from './lib/records.ts'
import { TEST_POOL, scratchRepo } from './lib/testing.ts'
import { inspectSheet, plan, write } from './sheets.ts'

let root = ''
const scratch: string[] = []

before(async () => {
  const repo = await scratchRepo()
  root = repo.root
  scratch.push(root)
  const t = loadTemplate(root, TEST_POOL)
  const files = paths(root, TEST_POOL)
  const incoming = [
    await inspectSheet(t, repo.inbox[0]!, '2026-11-01T10:00:00+00:00'),
    await inspectSheet(t, repo.inbox[1]!, '2026-11-01T09:00:00+00:00'),
  ]
  write(root, TEST_POOL, plan(t, readJson<Design>(files.design), [], [], incoming, 'test'))
  appendJsonl(files.curation, bulkAccepts(readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), [], 'test: all accepted', '2026-11-18T00:00:00+00:00'))
  await encodePool(root, TEST_POOL, () => {})
  freezeSet(root, TEST_POOL, 'test-red-12', 12, ['colour=red'], false, 1)
  freezeSet(root, TEST_POOL, 'test-all-32', 32, [], true, 2)
})

after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** A copy of the scratch repository to corrupt. */
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'likelylikes-corrupt-'))
  scratch.push(dir)
  cpSync(root, dir, { recursive: true })
  return dir
}

const rules = async (dir: string) => (await check(dir)).problems.map(p => p.rule)

test('the whole pipeline yields a pool and sets that pass the check', async () => {
  const files = paths(root, TEST_POOL)
  const subjects = readJsonl<Subject>(files.subjects)
  assert.equal(subjects.length, 32)
  // The blue sheet was generated first, so it is g01.
  assert.ok(subjects.filter(s => s.sheet === 'g01').every(s => s.values['colour'] === 'blue'))
  assert.equal(readJsonl<ImageRecord>(files.images).length, 32)
  assert.equal(readdirSync(files.served).length, 32)
  const red = readJson<SetRecord>(join(setsDir(root), 'test-red-12.json'))
  assert.equal(red.images.length, 12)
  assert.equal(red.published, null)
  const { problems, summary } = await check(root)
  assert.deepEqual(problems, [], summary)
})

test('encode and accept have nothing left to do on a second run', async () => {
  const files = paths(root, TEST_POOL)
  assert.deepEqual(bulkAccepts(readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), readJsonl<Decision>(files.curation), 'again', ''), [])
  const dir = copy()
  assert.equal((await encodePool(dir, TEST_POOL, () => {})).length, 0)
})

test('freeze refuses an oversize set unless it is marked large, and never overwrites one', () => {
  const dir = copy()
  assert.throws(() => freezeSet(dir, TEST_POOL, 'too-big', 17, [], false, 1), /--large/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'too-small', 11, [], false, 1), /at least 12/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'test-red-12', 12, ['colour=red'], false, 1), /frozen/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'red-17', 17, ['colour=red'], true, 1), /fewer than N/)
})

test('the check catches a served file that changed', async () => {
  const dir = copy()
  const served = paths(dir, TEST_POOL).served
  const name = readdirSync(served)[0]!
  writeFileSync(join(served, name), Buffer.concat([readFileSync(join(served, name)), Buffer.from([0])]))
  assert.ok((await rules(dir)).includes('served'))
})

test('the check catches a set over 16 not marked large', async () => {
  const dir = copy()
  const file = join(setsDir(dir), 'test-all-32.json')
  writeFileSync(file, JSON.stringify({ ...readJson<SetRecord>(file), large: false }))
  assert.ok((await rules(dir)).includes('sets'))
})

test('the check catches unsigned images in a published set', async () => {
  const dir = copy()
  const file = join(setsDir(dir), 'test-red-12.json')
  writeFileSync(file, JSON.stringify({ ...readJson<SetRecord>(file), published: '2026-11-18' }))
  assert.ok((await rules(dir)).includes('signed'))
})

test('the check catches a withdrawn image still in a set', async () => {
  const dir = copy()
  const set = readJson<SetRecord>(join(setsDir(dir), 'test-red-12.json'))
  const img = readJsonl<ImageRecord>(paths(dir, TEST_POOL).images).find(i => i.sha256 === set.images[0])!
  appendFileSync(paths(dir, TEST_POOL).curation, jsonLine({ subject: img.subject, candidate: img.candidate, decision: 'reject', reason: 'defect', note: 'test', tags: {}, time: '' }) + '\n')
  const found = await rules(dir)
  assert.ok(found.includes('withdrawn'))
  assert.ok(found.includes('selection'))
})

test('the check catches a set whose seed does not reproduce it', async () => {
  const dir = copy()
  const file = join(setsDir(dir), 'test-red-12.json')
  writeFileSync(file, JSON.stringify({ ...readJson<SetRecord>(file), seed: 999 }))
  assert.ok((await rules(dir)).includes('selection'))
})

test('the check catches a prompt that is not the template\'s and a cell with no subject', async () => {
  const dir = copy()
  const files = paths(dir, TEST_POOL)
  const subjects = readFileSync(files.subjects, 'utf8').split('\n')
  subjects[0] = subjects[0]!.replace('Sixteen', 'Fifteen')
  writeFileSync(files.subjects, subjects.join('\n'))
  const gens = readFileSync(files.generations, 'utf8').split('\n')
  writeFileSync(files.generations, gens.slice(1).join('\n'))
  const found = await rules(dir)
  assert.ok(found.includes('prompt'))
  assert.ok(found.includes('sheet'))
})

test('the check catches an accept without an image and a second accept for a subject', async () => {
  const dir = copy()
  const files = paths(dir, TEST_POOL)
  const g = readJsonl<Generation>(files.generations)[0]!
  appendJsonl(files.generations, [{ ...g, candidate: 2 }])
  appendJsonl(files.curation, [{ subject: g.subject, candidate: 2, decision: 'accept', reason: '', note: 'test', tags: {}, time: '' }])
  const found = await rules(dir)
  assert.ok(found.includes('images'))
  assert.ok(found.includes('curation'))
})

// End to end on a synthetic pool: sheets, accept, encode, freeze, check; then corruptions the check must catch.

import assert from 'node:assert/strict'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { bulkAccepts, namedAccepts } from './accept.ts'
import { check } from './check.ts'
import { encodePool } from './encode.ts'
import { freezeSet } from './freeze.ts'
import {
  appendJsonl, jsonLine, paths, readJson, readJsonl, renderPrompt, setsDir,
  type Decision, type Design, type Generation, type ImageRecord, type SetRecord, type Subject, type Template,
} from './lib/records.ts'
import { TEST_POOL, scratchRepo } from './lib/testing.ts'
import { rejections } from './reject.ts'
import { ingest } from './sheets.ts'

let root = ''
const scratch: string[] = []

before(async () => {
  const repo = await scratchRepo()
  root = repo.root
  scratch.push(root)
  const files = paths(root, TEST_POOL)
  await ingest(root, TEST_POOL, [repo.inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  await ingest(root, TEST_POOL, [repo.inbox[1]!], { time: '2026-11-01T09:00:00Z' })
  appendJsonl(files.curation, bulkAccepts(readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), [], 'test: all accepted', '2026-11-18T00:00:00+00:00'))
  const { refused } = await encodePool(root, TEST_POOL, () => {})
  assert.deepEqual(refused, [])
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
  // Added one at a time, each sheet is numbered after the last: red came first here.
  assert.ok(subjects.filter(s => s.sheet === 'g01').every(s => s.values['colour'] === 'red'))
  assert.equal(readJsonl<ImageRecord>(files.images).length, 32)
  assert.equal(readdirSync(files.served).length, 32)
  const red = readJson<SetRecord>(join(setsDir(root), 'test-red-12.json'))
  assert.equal(red.images.length, 12)
  assert.equal(red.considered.length, 16)
  assert.equal(red.published, null)
  const { problems, summary } = await check(root)
  assert.deepEqual(problems, [], summary)
})

test('encode and accept have nothing left to do on a second run', async () => {
  const files = paths(root, TEST_POOL)
  assert.deepEqual(bulkAccepts(readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), readJsonl<Decision>(files.curation), 'again', ''), [])
  const dir = copy()
  assert.equal((await encodePool(dir, TEST_POOL, () => {})).records.length, 0)
})

test('freeze refuses an oversize set unless it is marked large, and never overwrites one', () => {
  const dir = copy()
  assert.throws(() => freezeSet(dir, TEST_POOL, 'too-big', 17, [], false, 1), /--large/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'too-small', 11, [], false, 1), /at least 12/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'test-red-12', 12, ['colour=red'], false, 1), /frozen/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'red-17', 17, ['colour=red'], true, 1), /fewer than N/)
  assert.throws(() => freezeSet(dir, TEST_POOL, 'proto', 12, ['toString=red'], false, 1), /no parameter toString/)
})

test('withdrawing an image the set considered but did not choose leaves the set reproducible', async () => {
  const dir = copy()
  const set = readJson<SetRecord>(join(setsDir(dir), 'test-red-12.json'))
  const images = readJsonl<ImageRecord>(paths(dir, TEST_POOL).images)
  const passedOver = images.find(i => set.considered.includes(i.sha256) && !set.images.includes(i.sha256))!
  appendJsonl(paths(dir, TEST_POOL).curation, [{ subject: passedOver.subject, candidate: 1, decision: 'reject', reason: 'defect', note: 'test', tags: {}, time: '' }])
  const { problems } = await check(dir)
  // The 32-image set holds every image, so it rightly reports the withdrawal; the 12-image set does not.
  assert.deepEqual(problems.filter(p => p.where === 'set test-red-12'), [])
  assert.deepEqual(problems.map(p => `${p.where} ${p.rule}`), ['set test-all-32 withdrawn'])
})

test('encode carries on past a refused candidate, recording the rest, and keeps to one encoder version', async () => {
  const dir = copy()
  const files = paths(dir, TEST_POOL)
  // Reopen two subjects: drop their images and served files, then break one sheet's bytes.
  const images = readJsonl<ImageRecord>(files.images)
  const g = readJsonl<Generation>(files.generations)
  const victims = [images.find(i => g.find(x => x.subject === i.subject)!.sheet === 'g01')!, images.find(i => g.find(x => x.subject === i.subject)!.sheet === 'g02')!]
  writeFileSync(files.images, images.filter(i => !victims.includes(i)).map(i => jsonLine(i) + '\n').join(''))
  for (const v of victims) unlinkSync(join(files.served, `${v.sha256}.webp`))
  appendFileSync(join(files.sheets, 'g02.png'), Buffer.from([0]))
  const { records, refused } = await encodePool(dir, TEST_POOL, () => {})
  assert.equal(records.length, 1)
  assert.equal(refused.length, 1)
  assert.match(refused[0]!.reason, /SHA-256/)
  const all = readJsonl<ImageRecord>(files.images)
  writeFileSync(files.images, all.map(i => jsonLine({ ...i, encoder_version: 'older' }) + '\n').join(''))
  await assert.rejects(encodePool(dir, TEST_POOL, () => {}), /one pool keeps one encoder version/)
})

test('the check catches a served file that changed, or that is not an image', async () => {
  const dir = copy()
  const served = paths(dir, TEST_POOL).served
  const [a, b] = readdirSync(served)
  writeFileSync(join(served, a!), Buffer.concat([readFileSync(join(served, a!)), Buffer.from([0])]))
  writeFileSync(join(served, b!), 'not an image')
  const { problems } = await check(dir)
  assert.ok(problems.filter(p => p.rule === 'served').length >= 3, JSON.stringify(problems))
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
  assert.ok((await rules(dir)).includes('withdrawn'))
})

test('the check catches a set whose seed or considered list does not reproduce it', async () => {
  const dir = copy()
  const file = join(setsDir(dir), 'test-red-12.json')
  const set = readJson<SetRecord>(file)
  writeFileSync(file, JSON.stringify({ ...set, seed: 999 }))
  assert.ok((await rules(dir)).includes('selection'))
  const blue = readJsonl<ImageRecord>(paths(dir, TEST_POOL).images).find(i => i.values['colour'] === 'blue')!
  writeFileSync(file, JSON.stringify({ ...set, considered: [...set.considered, blue.sha256] }))
  assert.ok((await rules(dir)).includes('selection'))
})

test('the check catches a considered list out of pool order', async () => {
  const dir = copy()
  const file = join(setsDir(dir), 'test-red-12.json')
  const set = readJson<SetRecord>(file)
  writeFileSync(file, JSON.stringify({ ...set, considered: [...set.considered].reverse() }))
  const { problems } = await check(dir)
  assert.ok(problems.some(p => p.rule === 'selection' && /not in pool order/.test(p.detail)))
})

test('the check catches images made before the template\'s inset changed', async () => {
  const dir = copy()
  const file = paths(dir, TEST_POOL).template
  const t = readJson<Template>(file)
  writeFileSync(file, JSON.stringify({ ...t, sheet: { ...t.sheet!, inset: 2 } }))
  const { problems } = await check(dir)
  assert.equal(problems.filter(p => p.rule === 'encoding' && /served region/.test(p.detail)).length, 32)
})

test('the check catches a prompt that is not the template\'s and a cell with no generation', async () => {
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

test('the check catches a sheet lost with its generations, and a file in sheets/ no record names', async () => {
  const dir = copy()
  const files = paths(dir, TEST_POOL)
  const gens = readJsonl<Generation>(files.generations)
  writeFileSync(files.generations, gens.filter(g => g.sheet !== 'g02').map(g => jsonLine(g) + '\n').join(''))
  unlinkSync(join(files.sheets, 'g02.png'))
  unlinkSync(join(files.sheets, 'g02.md'))
  writeFileSync(join(files.sheets, 'stray.png'), 'x')
  const { problems } = await check(dir)
  assert.ok(problems.some(p => p.rule === 'sheet' && /g02: subjects name it, but no generation records it/.test(p.detail)), JSON.stringify(problems.slice(0, 5)))
  assert.ok(problems.some(p => p.rule === 'sheet' && /stray\.png: no record names it/.test(p.detail)))
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

test('a held-back subject stays out of a bulk accept, and an accept by name brings it back', async () => {
  const repo = await scratchRepo()
  scratch.push(repo.root)
  const files = paths(repo.root, TEST_POOL)
  await ingest(repo.root, TEST_POOL, [repo.inbox[0]!], { time: '2026-11-01T10:00:00Z' })
  const subjects = readJsonl<Subject>(files.subjects)
  const generations = readJsonl<Generation>(files.generations)
  const held = rejections(['s003'], 1, 'age', 'test: held back', '', generations, [], [], [])
  assert.equal(held.decisions.length, 1)
  appendJsonl(files.curation, held.decisions)
  const bulk = bulkAccepts(subjects, generations, readJsonl<Decision>(files.curation), 'test', '')
  assert.equal(bulk.length, 15)
  assert.ok(!bulk.some(d => d.subject === 's003'))
  appendJsonl(files.curation, bulk)
  assert.equal(namedAccepts(['s003'], 1, generations, readJsonl<Decision>(files.curation), 'test: looked, fine', '').length, 1)
  assert.throws(() => rejections(['s003'], 1, 'ugly', 'x', '', generations, [], [], []), /reason must be one of/)
  assert.throws(() => namedAccepts(['s003'], 2, generations, [], 'x', ''), /no candidate 2/)
})

test('a reject refuses to touch a published set and names the sets it breaks', () => {
  const files = paths(root, TEST_POOL)
  const images = readJsonl<ImageRecord>(files.images)
  const generations = readJsonl<Generation>(files.generations)
  const red = readJson<SetRecord>(join(setsDir(root), 'test-red-12.json'))
  const all = readJson<SetRecord>(join(setsDir(root), 'test-all-32.json'))
  const img = images.find(i => i.sha256 === red.images[0])!
  const ok = rejections([img.subject], 1, 'defect', 'test', '', generations, [], images, [red, all])
  assert.equal(ok.withdrawn.length, 1)
  assert.deepEqual(ok.affectedSets.sort(), ['test-all-32', 'test-red-12'])
  assert.throws(() => rejections([img.subject], 1, 'defect', 'test', '', generations, [], images, [{ ...red, published: '2026-11-18' }]), /published set/)
})

test('the design check applies an exclusion that names the stratify parameter, and ignores rejected candidates\' sizes', async () => {
  const t: Template = {
    id: 'test-plain', version: 1, question: '', prompt: 'A {ethnicity} face with {hair} hair, aged {age}.',
    parameters: { ethnicity: { a: 'A', b: 'B' }, hair: { x: 'x', y: 'y' }, age: { '30': '30' } },
    exclusions: [{ ethnicity: 'b', hair: 'y' }], tags: {},
    model: { provider: 'p', id: 'm', version: null }, settings: {}, served: { width: 64, height: 64, format: 'webp', quality: 80 },
  }
  const design: Design = { template: 'test-plain', version: 1, stratify: 'ethnicity', per_value: { a: 2, b: 2 }, balance: ['hair'], seed: 1 }
  const r = await scratchRepo(t, design)
  scratch.push(r.root)
  const files = paths(r.root, 'test-plain.v1')
  const values = [{ ethnicity: 'a', hair: 'x', age: '30' }, { ethnicity: 'a', hair: 'y', age: '30' }, { ethnicity: 'b', hair: 'x', age: '30' }, { ethnicity: 'b', hair: 'x', age: '30' }]
  appendJsonl(files.subjects, values.map((v, i) => ({ subject: `s00${i + 1}`, values: v, prompt: renderPrompt(t, v) })))
  const gen = (subject: string, candidate: number, size: number) => ({ subject, candidate, sha256: 'x', width: size, height: size, format: 'png', provider: 'p', model: 'm', settings: {}, time: '' })
  appendJsonl(files.generations, [gen('s001', 1, 100), gen('s001', 2, 1024), gen('s002', 1, 1024), gen('s003', 1, 1024), gen('s004', 1, 1024)])
  appendJsonl(files.curation, [{ subject: 's001', candidate: 1, decision: 'reject', reason: 'defect', note: 'too small', tags: {}, time: '' }])
  const { problems } = await check(r.root)
  assert.deepEqual(problems.filter(p => p.where === 'test-plain.v1' && (p.rule === 'design' || p.rule === 'size')), [])
})

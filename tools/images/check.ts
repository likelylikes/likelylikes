// The offline check (images.md §8, image-pipeline.md §3): every pool's records and files, and every set.
// The online part, on the objects in R2 and their C2PA manifests, is not implemented yet.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { parseCli, run } from './lib/cli.ts'
import {
  MEASURES, MIN_INSET_FRACTIONAL, REJECT_REASONS, candidateKey, cellCrop, combinations, designProblems, exactGrid, extension,
  has, isExcluded, lastDecisions, listPools, loadTemplate, normalisePrompt, parsePool, paths, poolName, readJson,
  readJsonl, renderPrompt, sameJson, servedRegion, setsDir, sha256, sheetNumber, subjectNumber, withdrawnImages,
  type Decision, type Design, type Estimate, type Generation, type ImageRecord, type SetRecord, type Subject, type Template,
} from './lib/records.ts'
import { matchesFilter, selectFrom } from './lib/select.ts'

const USAGE = `Usage: npm run images:check

Checks every pool under images/pools and every set under images/sets against images.md §8 and
image-pipeline.md §3. Exits non-zero on any problem.`

export const MIN_N = 12
export const MAX_N = 16
export const MIN_AGE = 25

export interface Problem {
  where: string
  rule: string
  detail: string
}

interface Pool {
  name: string
  template: Template
  subjects: Subject[]
  generations: Generation[]
  curation: Decision[]
  estimates: Estimate[]
  images: ImageRecord[]
  withdrawn: Set<string>
}

type Report = (rule: string, detail: string) => void

export async function check(root: string): Promise<{ problems: Problem[]; summary: string }> {
  const problems: Problem[] = []
  const pools = new Map<string, Pool>()
  const counts = { pools: 0, subjects: 0, generations: 0, decisions: 0, estimates: 0, images: 0, sets: 0 }
  for (const name of listPools(root)) {
    const report: Report = (rule, detail) => problems.push({ where: name, rule, detail })
    let pool: Pool
    try {
      pool = loadPool(root, name)
    } catch (e) {
      report('records', (e as Error).message)
      continue
    }
    pools.set(name, pool)
    counts.pools++
    counts.subjects += pool.subjects.length
    counts.generations += pool.generations.length
    counts.decisions += pool.curation.length
    counts.estimates += pool.estimates.length
    counts.images += pool.images.length
    checkTemplate(pool.template, report)
    checkSubjects(root, pool, report)
    checkGenerations(pool, report)
    if (pool.template.sheet) checkSheets(root, pool, report)
    checkCuration(pool, report)
    checkEstimates(pool, report)
    await checkImages(root, pool, report)
  }
  for (const set of loadSets(root, problems)) {
    counts.sets++
    checkSet(set, pools, (rule, detail) => problems.push({ where: `set ${set.set_id}`, rule, detail }))
  }
  const summary = `${counts.pools} pools, ${counts.subjects} subjects, ${counts.generations} generations, ${counts.decisions} decisions, ${counts.estimates} estimates, ${counts.images} images, ${counts.sets} sets`
  return { problems, summary }
}

function loadPool(root: string, name: string): Pool {
  parsePool(name)
  const files = paths(root, name)
  const template = loadTemplate(root, name)
  const images = readJsonl<ImageRecord>(files.images)
  const curation = readJsonl<Decision>(files.curation)
  return {
    name, template, images, curation,
    subjects: readJsonl<Subject>(files.subjects),
    generations: readJsonl<Generation>(files.generations),
    estimates: readJsonl<Estimate>(files.estimates),
    withdrawn: withdrawnImages(images, curation),
  }
}

/** Estimates name a candidate that exists, a known measure, a sound range, an instrument and a time. */
function checkEstimates(pool: Pool, report: Report): void {
  const gens = new Set(pool.generations.map(g => candidateKey(g.subject, g.candidate)))
  for (const e of pool.estimates) {
    const what = `estimate for ${e.subject} c${e.candidate}`
    if (!gens.has(candidateKey(e.subject, e.candidate))) report('estimates', `${what}: no such candidate`)
    if (!(MEASURES as readonly string[]).includes(e.measure)) report('estimates', `${what}: measure ${e.measure} is not one of ${MEASURES.join(', ')}`)
    if (!(typeof e.low === 'number' && typeof e.high === 'number' && Number.isFinite(e.low) && Number.isFinite(e.high) && e.low >= 0 && e.low <= e.high && e.high <= 150)) {
      report('estimates', `${what}: range ${e.low}..${e.high} is not 0 <= low <= high <= 150`)
    }
    if (typeof e.by !== 'string' || !e.by.trim()) report('estimates', `${what}: no instrument named`)
    if (typeof e.time !== 'string' || Number.isNaN(Date.parse(e.time))) report('estimates', `${what}: time ${JSON.stringify(e.time)} is not a date`)
  }
}

function checkTemplate(t: Template, report: Report): void {
  for (const value of Object.keys(t.parameters['age'] ?? {})) {
    if (!(Number(value) >= MIN_AGE)) report('age', `template age value ${value} is under ${MIN_AGE}`)
  }
}

function checkValues(t: Template, values: Record<string, string>, what: string, report: Report): void {
  for (const name of Object.keys(t.parameters)) {
    if (!has(values, name)) report('values', `${what}: no value for ${name}`)
    else if (!has(t.parameters[name]!, values[name]!)) report('values', `${what}: ${name} = ${values[name]} is not in the template's list`)
  }
  for (const name of Object.keys(values)) if (!has(t.parameters, name)) report('values', `${what}: ${name} is not a parameter`)
  if (isExcluded(t, values)) report('values', `${what}: ${JSON.stringify(values)} is an excluded combination`)
  if (has(values, 'age') && !(Number(values['age']) >= MIN_AGE)) report('age', `${what}: age ${values['age']} is under ${MIN_AGE}`)
}

function checkSubjects(root: string, pool: Pool, report: Report): void {
  const t = pool.template
  const ids = new Set<string>()
  for (const s of pool.subjects) {
    try {
      subjectNumber(s.subject)
    } catch (e) {
      report('subjects', (e as Error).message)
    }
    if (ids.has(s.subject)) report('subjects', `${s.subject} appears twice`)
    ids.add(s.subject)
    checkValues(t, s.values, s.subject, report)
    try {
      if (s.prompt !== renderPrompt(t, s.values)) report('prompt', `${s.subject}: prompt is not the template rendered with its values`)
    } catch (e) {
      report('prompt', `${s.subject}: ${(e as Error).message}`)
    }
    if (t.sheet && (!s.sheet || !s.cell)) report('subjects', `${s.subject}: the template generates sheets, but the subject has no sheet and cell`)
    if (!t.sheet && (s.sheet || s.cell)) report('subjects', `${s.subject}: has a sheet, but the template generates none`)
  }
  checkDesign(root, pool, report)
}

/**
 * image-pipeline.md §2.1: per_value counts; within each value, each balanced parameter's possible
 * values, and each allowed combination of them, equally often to within one. "Allowed" applies the
 * exclusions with the stratify value included, so an exclusion that names it counts.
 */
function checkDesign(root: string, pool: Pool, report: Report): void {
  const file = paths(root, pool.name).design
  if (!existsSync(file)) {
    report('design', 'no design.json')
    return
  }
  let d: Design
  try {
    d = readJson<Design>(file)
  } catch (e) {
    report('design', (e as Error).message)
    return
  }
  const t = pool.template
  const problems = designProblems(d, t)
  for (const p of problems) report('design', p)
  if (problems.length) return
  for (const value of Object.keys(t.parameters[d.stratify]!)) {
    const group = pool.subjects.filter(s => s.values[d.stratify] === value)
    const want = d.per_value[value] ?? 0
    if (group.length !== want) report('design', `${d.stratify} = ${value}: ${group.length} subjects, design says ${want}`)
    if (!group.length || !d.balance.length) continue
    const allowed = combinations(t, [d.stratify, ...d.balance]).filter(c => c[d.stratify] === value)
    for (const name of d.balance) {
      const possible = [...new Set(allowed.map(c => c[name]!))]
      const tally = possible.map(v => group.filter(s => s.values[name] === v).length)
      if (Math.max(...tally) - Math.min(...tally) > 1) report('design', `${d.stratify} = ${value}: ${name} values appear ${tally.join('/')} times, not equally to within one`)
    }
    const tally = allowed.map(c => group.filter(s => d.balance.every(n => s.values[n] === c[n])).length)
    if (Math.max(...tally) - Math.min(...tally) > 1) report('design', `${d.stratify} = ${value}: a combination of ${d.balance.join(', ')} repeats before every combination has appeared`)
  }
}

function checkGenerations(pool: Pool, report: Report): void {
  const t = pool.template
  const subjects = new Map(pool.subjects.map(s => [s.subject, s]))
  const last = lastDecisions(pool.curation)
  const keys = new Set<string>()
  let reference: Generation | undefined
  for (const g of pool.generations) {
    const what = `${g.subject} c${g.candidate}`
    const s = subjects.get(g.subject)
    if (!s) report('generations', `${what}: no such subject`)
    if (!(Number.isInteger(g.candidate) && g.candidate >= 1)) report('generations', `${what}: candidate must be a positive integer`)
    if (keys.has(candidateKey(g.subject, g.candidate))) report('generations', `${what} appears twice`)
    keys.add(candidateKey(g.subject, g.candidate))
    if (g.provider !== t.model.provider || g.model !== t.model.id || !sameJson(g.settings, t.settings) || g.service !== t.model.service) {
      report('model', `${what}: provider, model or settings differ from the template's`)
    }
    if (t.sheet) checkCrop(t, g, s, what, report)
    // The size rules are for candidates still in play; one the tools rejected for its size is not.
    if (last.get(candidateKey(g.subject, g.candidate))?.decision === 'reject') continue
    reference ??= g
    if (g.width !== reference.width || g.height !== reference.height) report('size', `${what}: original is ${g.width}x${g.height}, others ${reference.width}x${reference.height}`)
    if (!t.sheet && (g.width !== g.height || g.width < t.served.width || g.height < t.served.height)) {
      report('size', `${what}: original ${g.width}x${g.height} is not square and at least ${t.served.width}x${t.served.height}`)
    }
  }
}

function checkCrop(t: Template, g: Generation, s: Subject | undefined, what: string, report: Report): void {
  const { rows, columns } = t.sheet!
  const inset = t.sheet!.inset ?? 0
  if (!g.sheet || !g.crop) {
    report('sheet', `${what}: the template generates sheets, but the generation has no sheet and crop`)
    return
  }
  if (g.width * rows !== g.height * columns) {
    report('sheet', `${what}: a ${g.width}x${g.height} sheet does not hold ${rows}x${columns} square cells`)
    return
  }
  if (!s?.cell || s.sheet !== g.sheet) {
    report('sheet', `${what}: the generation's sheet is not the subject's`)
    return
  }
  const want = cellCrop(g.width, g.height, rows, columns, s.cell.row, s.cell.column)
  if (!sameJson(g.crop, want)) report('sheet', `${what}: crop ${JSON.stringify(g.crop)} is not cell r${s.cell.row}c${s.cell.column} ${JSON.stringify(want)}`)
  if (!exactGrid(g.width, g.height, rows, columns) && inset < MIN_INSET_FRACTIONAL) report('sheet', `${what}: the grid does not divide the sheet, so the inset must be at least ${MIN_INSET_FRACTIONAL}`)
  const served = want.width - 2 * inset
  if (served < t.served.width || served < t.served.height) report('size', `${what}: cell ${want.width} px, ${served} px less the inset, is smaller than the served size`)
}

/** Every sheet a subject or generation names is in git, whole; every cell has one subject; nothing else is in sheets/. */
function checkSheets(root: string, pool: Pool, report: Report): void {
  const { rows, columns } = pool.template.sheet!
  const files = paths(root, pool.name)
  const names = new Set<string>([...pool.subjects.flatMap(s => (s.sheet ? [s.sheet] : [])), ...pool.generations.flatMap(g => (g.sheet ? [g.sheet] : []))])
  const hashes = new Map<string, string>()
  const expected = new Set<string>()
  for (const sheet of [...names].sort()) {
    try {
      sheetNumber(sheet)
    } catch (e) {
      report('sheet', (e as Error).message)
    }
    const subjects = pool.subjects.filter(s => s.sheet === sheet)
    const gens = pool.generations.filter(g => g.sheet === sheet)
    for (const s of subjects) {
      const own = gens.filter(g => g.subject === s.subject)
      if (own.length !== 1 || own[0]!.candidate !== 1) report('sheet', `${s.subject}: has ${own.length} generations from ${sheet}; a sheet's subject has exactly one, candidate 1`)
    }
    const cells = subjects.map(s => `${s.cell?.row},${s.cell?.column}`)
    const inGrid = subjects.every(s => s.cell && Number.isInteger(s.cell.row) && Number.isInteger(s.cell.column) && s.cell.row >= 1 && s.cell.row <= rows && s.cell.column >= 1 && s.cell.column <= columns)
    if (!inGrid || new Set(cells).size !== cells.length || cells.length !== rows * columns) {
      report('sheet', `${sheet}: ${subjects.length} subjects over ${new Set(cells).size} cells; want each of the ${rows * columns} cells once`)
    }
    const g0 = gens[0]
    if (!g0) {
      report('sheet', `${sheet}: subjects name it, but no generation records it`)
      continue
    }
    if (gens.some(g => g.sha256 !== g0.sha256 || g.width !== g0.width || g.height !== g0.height || g.format !== g0.format || g.time !== g0.time)) {
      report('sheet', `${sheet}: its generations disagree on the sheet's hash, size, format or time`)
    }
    const other = hashes.get(g0.sha256)
    if (other) report('sheet', `${sheet} and ${other} are the same file`)
    hashes.set(g0.sha256, sheet)
    let image: string
    try {
      image = join(files.sheets, `${sheet}.${extension(g0.format)}`)
    } catch (e) {
      report('sheet', `${sheet}: ${(e as Error).message}`)
      continue
    }
    expected.add(basename(image))
    expected.add(`${sheet}.md`)
    if (!existsSync(image)) report('sheet', `${sheet}: ${image} is missing`)
    else if (sha256(readFileSync(image)) !== g0.sha256) report('sheet', `${sheet}: ${image} does not have the recorded SHA-256`)
    const promptFile = join(files.sheets, `${sheet}.md`)
    const prompts = new Set(subjects.map(s => s.prompt))
    if (!existsSync(promptFile)) report('sheet', `${sheet}: ${promptFile} is missing`)
    else if (prompts.size !== 1 || normalisePrompt(readFileSync(promptFile, 'utf8')) !== normalisePrompt([...prompts][0]!)) {
      report('sheet', `${sheet}: the prompt as typed is not its subjects' prompt`)
    }
  }
  for (const name of existsSync(files.sheets) ? readdirSync(files.sheets) : []) {
    if (!expected.has(name)) report('sheet', `${join(files.sheets, name)}: no record names it`)
  }
}

function checkCuration(pool: Pool, report: Report): void {
  const t = pool.template
  const gens = new Set(pool.generations.map(g => candidateKey(g.subject, g.candidate)))
  for (const d of pool.curation) {
    const what = `${d.subject} c${d.candidate}`
    if (!gens.has(candidateKey(d.subject, d.candidate))) report('curation', `${what}: decision on a candidate never generated`)
    if (d.decision !== 'accept' && d.decision !== 'reject') report('curation', `${what}: decision ${d.decision}`)
    if (d.decision === 'reject' && !(REJECT_REASONS as readonly string[]).includes(d.reason)) report('curation', `${what}: reject reason ${d.reason} is not one of ${REJECT_REASONS.join(', ')}`)
    for (const [name, value] of Object.entries(d.tags ?? {})) {
      if (!has(t.tags, name) || !t.tags[name]!.includes(value)) report('tags', `${what}: tag ${name} = ${value} is not one the template allows`)
    }
  }
  const last = lastDecisions(pool.curation)
  const bySubject = new Map<string, number[]>()
  for (const g of pool.generations) bySubject.set(g.subject, [...(bySubject.get(g.subject) ?? []), g.candidate])
  for (const [subject, candidates] of bySubject) {
    candidates.sort((a, b) => a - b)
    const accepted = candidates.filter(c => last.get(candidateKey(subject, c))?.decision === 'accept')
    if (accepted.length > 1) report('curation', `${subject}: ${accepted.length} accepted candidates`)
    const firstPassing = candidates.find(c => last.get(candidateKey(subject, c))?.decision !== 'reject')
    if (accepted.length === 1 && accepted[0] !== firstPassing) report('curation', `${subject}: accepted c${accepted[0]}, but c${firstPassing} comes first and is not rejected`)
  }
}

async function checkImages(root: string, pool: Pool, report: Report): Promise<void> {
  const t = pool.template
  const files = paths(root, pool.name)
  const gens = new Map(pool.generations.map(g => [candidateKey(g.subject, g.candidate), g]))
  const subjects = new Map(pool.subjects.map(s => [s.subject, s]))
  const last = lastDecisions(pool.curation)
  const everAccepted = new Set(pool.curation.filter(d => d.decision === 'accept').map(d => candidateKey(d.subject, d.candidate)))
  const seen = new Set<string>()
  const encoders = new Set<string>()
  for (const img of pool.images) {
    const what = `image ${String(img.sha256).slice(0, 12)} (${img.subject} c${img.candidate})`
    if (seen.has(img.sha256)) report('images', `${what} appears twice`)
    seen.add(img.sha256)
    const key = candidateKey(img.subject, img.candidate)
    const g = gens.get(key)
    if (!g) report('images', `${what}: no such generation`)
    else {
      if (img.original !== g.sha256) report('original', `${what}: original ${img.original} is not the SHA-256 the generation log recorded`)
      // The served region follows from the template; an image made before the inset changed is out of step.
      if (!sameJson(img.region, servedRegion(t, g))) report('encoding', `${what}: served region ${JSON.stringify(img.region)} is not ${JSON.stringify(servedRegion(t, g))}, which the template's inset gives`)
    }
    if (img.template !== t.id || img.version !== t.version) report('images', `${what}: belongs to ${img.template} v${img.version}`)
    const s = subjects.get(img.subject)
    if (s && !sameJson(img.values, s.values)) report('values', `${what}: values differ from the subject's`)
    checkValues(t, img.values, what, report)
    // An image needs an accept; if its candidate was rejected since, the image is withdrawn, which §8 allows outside sets.
    if (!everAccepted.has(key)) report('curation', `${what}: no accept in the curation log`)
    const decision = last.get(key)
    if (decision?.decision === 'accept' && !sameJson(img.tags, decision.tags ?? {})) report('tags', `${what}: tags differ from the accept's`)
    for (const [name, value] of Object.entries(img.tags ?? {})) if (!has(t.tags, name) || !t.tags[name]!.includes(value)) report('tags', `${what}: tag ${name} = ${value} is not allowed`)
    if (img.quality !== t.served.quality) report('encoding', `${what}: quality ${img.quality}, template says ${t.served.quality}`)
    encoders.add(`${img.encoder} ${img.encoder_version}`)
    if (typeof img.signed !== 'boolean') report('images', `${what}: signed must be true or false`)
    if (img.width !== t.served.width || img.height !== t.served.height || img.format !== t.served.format) {
      report('served', `${what}: record says ${img.format} ${img.width}x${img.height}, template says ${t.served.format} ${t.served.width}x${t.served.height}`)
    }
    let file: string
    try {
      file = join(files.served, `${img.sha256}.${extension(img.format)}`)
    } catch (e) {
      report('served', `${what}: ${(e as Error).message}`)
      continue
    }
    if (!existsSync(file)) {
      report('served', `${what}: ${file} is missing`)
      continue
    }
    const bytes = readFileSync(file)
    if (sha256(bytes) !== img.sha256) report('served', `${what}: file content does not match its name`)
    if (bytes.length !== img.bytes) report('served', `${what}: ${bytes.length} bytes, record says ${img.bytes}`)
    try {
      const meta = await sharp(bytes).metadata()
      if (meta.format !== t.served.format || meta.width !== t.served.width || meta.height !== t.served.height) {
        report('served', `${what}: file is ${meta.format} ${meta.width}x${meta.height}, template says ${t.served.format} ${t.served.width}x${t.served.height}`)
      }
    } catch (e) {
      report('served', `${what}: ${file} is not an image sharp can read: ${(e as Error).message}`)
    }
  }
  if (encoders.size > 1) report('encoding', `served files come from ${encoders.size} encoder versions: ${[...encoders].join('; ')}`)
  for (const [key, d] of last) {
    if (d.decision !== 'accept') continue
    if (!pool.images.some(i => candidateKey(i.subject, i.candidate) === key)) report('images', `${d.subject} c${d.candidate}: accepted but has no image`)
  }
  for (const name of existsSync(files.served) ? readdirSync(files.served) : []) {
    const hash = basename(name).replace(/\.[^.]+$/, '')
    if (!seen.has(hash)) report('served', `${join(files.served, name)}: no image record`)
  }
}

function loadSets(root: string, problems: Problem[]): SetRecord[] {
  const dir = setsDir(root)
  if (!existsSync(dir)) return []
  const out: SetRecord[] = []
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name)
    if (!name.endsWith('.json') || !statSync(file).isFile()) {
      problems.push({ where: file, rule: 'sets', detail: 'not a set file' })
      continue
    }
    try {
      const set = readJson<SetRecord>(file)
      if (set.set_id !== name.slice(0, -'.json'.length)) problems.push({ where: file, rule: 'sets', detail: `set_id ${set.set_id} is not the file name` })
      out.push(set)
    } catch (e) {
      problems.push({ where: file, rule: 'sets', detail: (e as Error).message })
    }
  }
  return out
}

function checkSet(set: SetRecord, pools: Map<string, Pool>, report: Report): void {
  const pool = pools.get(poolName(set.template, set.version))
  if (!pool) {
    report('sets', `no pool ${poolName(set.template, set.version)}`)
    return
  }
  const t = pool.template
  if (!Array.isArray(set.images) || !Array.isArray(set.considered) || typeof set.filter !== 'object' || set.filter === null) {
    report('sets', 'images, considered and filter must be present')
    return
  }
  if (!Number.isInteger(set.n) || set.images.length !== set.n) report('sets', `N = ${set.n} but ${set.images.length} images`)
  if (new Set(set.images).size !== set.images.length) report('sets', 'an image appears twice')
  if (set.n < MIN_N) report('sets', `N = ${set.n} is under ${MIN_N}`)
  if (set.n > MAX_N && set.large !== true) report('sets', `N = ${set.n} is over ${MAX_N} and the set is not marked large`)
  if (typeof set.large !== 'boolean') report('sets', 'large must be true or false')
  if (!(typeof set.seed === 'number' && Number.isSafeInteger(set.seed) && set.seed >= 0)) report('sets', `seed must be a non-negative integer, not ${JSON.stringify(set.seed)}`)
  for (const [name, values] of Object.entries(set.filter)) {
    if (!has(t.parameters, name)) report('sets', `filter names ${name}, not a parameter`)
    else for (const v of values) if (!has(t.parameters[name]!, v)) report('sets', `filter allows ${name} = ${v}, not a value`)
  }
  const byHash = new Map(pool.images.map(i => [i.sha256, i]))
  for (const hash of set.images) {
    const img = byHash.get(hash)
    if (!img) report('sets', `${String(hash).slice(0, 12)} is not an image of ${pool.name}`)
    else if (pool.withdrawn.has(hash)) report('withdrawn', `${hash.slice(0, 12)} (${img.subject}) is withdrawn`)
    else if (set.published !== null && img.signed !== true) report('signed', `${hash.slice(0, 12)} (${img.subject}) is unsigned, in a published set`)
  }
  if (set.published !== null && (typeof set.published !== 'string' || Number.isNaN(Date.parse(set.published)))) report('sets', `published must be null or a date, not ${JSON.stringify(set.published)}`)
  // Re-run on what the set recorded it chose from: later withdrawals, new images and log order change
  // nothing. Freeze writes that list; the check holds it to pool order, the pool and the filter.
  if (new Set(set.considered).size !== set.considered.length) report('selection', 'an image appears twice in considered')
  const position = new Map(pool.images.map((i, k) => [i.sha256, k]))
  const considered: ImageRecord[] = []
  for (const hash of set.considered) {
    const img = byHash.get(hash)
    if (!img) report('selection', `considered ${String(hash).slice(0, 12)} is not an image of ${pool.name}`)
    else if (!matchesFilter(img.values, set.filter)) report('selection', `considered ${hash.slice(0, 12)} (${img.subject}) does not match the filter`)
    else considered.push(img)
  }
  if (considered.length !== set.considered.length) return
  if (considered.some((img, k) => k > 0 && position.get(img.sha256)! < position.get(considered[k - 1]!.sha256)!)) report('selection', 'considered is not in pool order')
  try {
    const again = selectFrom(t, considered, set.filter, set.n, set.seed)
    if (!sameJson(again, set.images)) report('selection', 're-running the filter and seed does not reproduce the image list')
  } catch (e) {
    report('selection', (e as Error).message)
  }
}

async function main(): Promise<void> {
  const { root } = parseCli(USAGE, {})
  const { problems, summary } = await check(root)
  for (const p of problems) console.error(`${p.where}: ${p.rule}: ${p.detail}`)
  if (problems.length) {
    console.error(`images check: ${problems.length} problems (${summary})`)
    process.exit(1)
  }
  console.log(`images check: ok (${summary})`)
}

if (import.meta.main) run(main)

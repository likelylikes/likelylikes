// The offline check (images.md §8, image-pipeline.md §3): every pool's records and files, and every set.
// The online part, on the objects in R2 and their C2PA manifests, is not implemented yet.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { run } from './lib/cli.ts'
import { parseCli } from './lib/cli.ts'
import {
  candidateKey, combinations, extension, isExcluded, lastDecisions, listPools, loadTemplate, parsePool,
  paths, poolName, readJson, readJsonl, renderPrompt, sameJson, setsDir, sha256, sheetNumber, subjectNumber,
  withdrawnImages,
  type Decision, type Design, type Generation, type ImageRecord, type SetRecord, type Subject, type Template,
} from './lib/records.ts'
import { selectImages } from './lib/select.ts'

const USAGE = `Usage: npm run images:check

Checks every pool under images/pools and every set under images/sets against images.md §8 and
image-pipeline.md §3. Exits non-zero on any problem.`

export const MIN_N = 12
export const MAX_N = 16
export const MIN_AGE = 25
const REJECT_REASONS = ['defect', 'style', 'parameters', 'age', 'likeness']

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
  images: ImageRecord[]
  withdrawn: Set<string>
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

export async function check(root: string): Promise<{ problems: Problem[]; summary: string }> {
  const problems: Problem[] = []
  const pools = new Map<string, Pool>()
  const counts = { pools: 0, subjects: 0, generations: 0, decisions: 0, images: 0, sets: 0 }
  for (const name of listPools(root)) {
    const report = (rule: string, detail: string, where = name) => problems.push({ where, rule, detail })
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
    counts.images += pool.images.length
    checkTemplate(pool.template, report)
    checkSubjects(root, pool, report)
    checkGenerations(root, pool, report)
    checkCuration(pool, report)
    await checkImages(root, pool, report)
  }
  for (const set of loadSets(root, problems)) {
    counts.sets++
    checkSet(set, pools, (rule, detail) => problems.push({ where: `set ${set.set_id}`, rule, detail }))
  }
  const summary = `${counts.pools} pools, ${counts.subjects} subjects, ${counts.generations} generations, ${counts.decisions} decisions, ${counts.images} images, ${counts.sets} sets`
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
    withdrawn: withdrawnImages(images, curation),
  }
}

type Report = (rule: string, detail: string) => void

function checkTemplate(t: Template, report: Report): void {
  for (const value of Object.keys(t.parameters['age'] ?? {})) {
    if (!(Number(value) >= MIN_AGE)) report('age', `template age value ${value} is under ${MIN_AGE}`)
  }
  if (t.sheet && !(Number.isInteger(t.sheet.rows) && t.sheet.rows > 0 && Number.isInteger(t.sheet.columns) && t.sheet.columns > 0)) {
    report('template', `sheet rows and columns must be positive integers: ${JSON.stringify(t.sheet)}`)
  }
}

function checkValues(t: Template, values: Record<string, string>, what: string, report: Report): void {
  for (const name of Object.keys(t.parameters)) {
    const v = values[name]
    if (v === undefined) report('values', `${what}: no value for ${name}`)
    else if (!(v in t.parameters[name]!)) report('values', `${what}: ${name} = ${v} is not in the template's list`)
  }
  for (const name of Object.keys(values)) if (!(name in t.parameters)) report('values', `${what}: ${name} is not a parameter`)
  if (isExcluded(t, values)) report('values', `${what}: ${JSON.stringify(values)} is an excluded combination`)
  const age = values['age']
  if (age !== undefined && !(Number(age) >= MIN_AGE)) report('age', `${what}: age ${age} is under ${MIN_AGE}`)
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

/** image-pipeline.md §2.1: per_value counts, each balanced value equally often to within one, and combinations likewise. */
function checkDesign(root: string, pool: Pool, report: Report): void {
  const file = paths(root, pool.name).design
  if (!existsSync(file)) {
    report('design', 'no design.json')
    return
  }
  const d = readJson<Design>(file)
  const t = pool.template
  if (d.template !== t.id || d.version !== t.version) report('design', `design is for ${d.template} v${d.version}`)
  if (!(d.stratify in t.parameters)) {
    report('design', `stratify parameter ${d.stratify} is not in the template`)
    return
  }
  for (const value of Object.keys(t.parameters[d.stratify]!)) {
    const group = pool.subjects.filter(s => s.values[d.stratify] === value)
    const want = d.per_value[value] ?? 0
    if (group.length !== want) report('design', `${d.stratify} = ${value}: ${group.length} subjects, design says ${want}`)
    if (!group.length) continue
    for (const name of d.balance) {
      const tally = Object.keys(t.parameters[name] ?? {}).map(v => group.filter(s => s.values[name] === v).length)
      if (Math.max(...tally) - Math.min(...tally) > 1) report('design', `${d.stratify} = ${value}: ${name} values appear ${tally.join('/')} times, not equally to within one`)
    }
    if (d.balance.length) {
      const tally = combinations(t, d.balance).map(c => group.filter(s => d.balance.every(n => s.values[n] === c[n])).length)
      if (Math.max(...tally) - Math.min(...tally) > 1) report('design', `${d.stratify} = ${value}: a combination of ${d.balance.join(', ')} repeats before every combination has appeared`)
    }
  }
}

function checkGenerations(root: string, pool: Pool, report: Report): void {
  const t = pool.template
  const subjects = new Map(pool.subjects.map(s => [s.subject, s]))
  const keys = new Set<string>()
  const first = pool.generations[0]
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
    if (first && (g.width !== first.width || g.height !== first.height)) report('size', `${what}: original is ${g.width}x${g.height}, others ${first.width}x${first.height}`)
    if (t.sheet) checkCrop(t, g, s, what, report)
    else if (g.width !== g.height || g.width < t.served.width || g.height < t.served.height) {
      report('size', `${what}: original ${g.width}x${g.height} is not square and at least ${t.served.width}x${t.served.height}`)
    }
  }
  if (t.sheet) checkSheets(root, pool, report)
}

function checkCrop(t: Template, g: Generation, s: Subject | undefined, what: string, report: Report): void {
  const { rows, columns } = t.sheet!
  const c = g.crop
  if (!g.sheet || !c) {
    report('sheet', `${what}: the template generates sheets, but the generation has no sheet and crop`)
    return
  }
  const cell = g.width / columns
  const ok = Number.isInteger(cell) && g.height / rows === cell && c.width === cell && c.height === cell &&
    c.x % cell === 0 && c.y % cell === 0 && c.x >= 0 && c.y >= 0 && c.x + c.width <= g.width && c.y + c.height <= g.height
  if (!ok) {
    report('sheet', `${what}: crop ${JSON.stringify(c)} is not a cell of the ${rows}x${columns} grid of a ${g.width}x${g.height} sheet`)
    return
  }
  if (cell < t.served.width || cell < t.served.height) report('size', `${what}: cell ${cell} px is smaller than the served size`)
  if (s && (s.sheet !== g.sheet || s.cell?.row !== c.y / cell + 1 || s.cell?.column !== c.x / cell + 1)) {
    report('sheet', `${what}: crop does not match the subject's sheet and cell`)
  }
}

/** Every cell of every sheet belongs to exactly one subject; the sheet and its prompt are in git. */
function checkSheets(root: string, pool: Pool, report: Report): void {
  const t = pool.template
  const { rows, columns } = t.sheet!
  const bySheet = new Map<string, Generation[]>()
  for (const g of pool.generations) if (g.sheet) bySheet.set(g.sheet, [...(bySheet.get(g.sheet) ?? []), g])
  const hashes = new Map<string, string>()
  const files = paths(root, pool.name)
  for (const [sheet, gens] of bySheet) {
    try {
      sheetNumber(sheet)
    } catch (e) {
      report('sheet', (e as Error).message)
    }
    const g0 = gens[0]!
    if (gens.some(g => g.sha256 !== g0.sha256 || g.width !== g0.width || g.height !== g0.height || g.format !== g0.format || g.time !== g0.time)) {
      report('sheet', `${sheet}: its generations disagree on the sheet's hash, size, format or time`)
    }
    const other = hashes.get(g0.sha256)
    if (other) report('sheet', `${sheet} and ${other} are the same file`)
    hashes.set(g0.sha256, sheet)
    const cells = new Set(gens.filter(g => g.crop).map(g => `${g.crop!.x},${g.crop!.y}`))
    if (cells.size !== gens.length || gens.length !== rows * columns) report('sheet', `${sheet}: ${gens.length} subjects over ${cells.size} cells; want each of ${rows * columns} cells once`)
    const image = join(files.sheets, `${sheet}.${extension(g0.format)}`)
    if (!existsSync(image)) report('sheet', `${sheet}: ${image} is missing`)
    else if (sha256(readFileSync(image)) !== g0.sha256) report('sheet', `${sheet}: ${image} does not have the recorded SHA-256`)
    const promptFile = join(files.sheets, `${sheet}.md`)
    const prompts = new Set(gens.map(g => pool.subjects.find(s => s.subject === g.subject)?.prompt))
    if (!existsSync(promptFile)) report('sheet', `${sheet}: ${promptFile} is missing`)
    else if (prompts.size !== 1 || normalise(readFileSync(promptFile, 'utf8')) !== normalise([...prompts][0] ?? '')) {
      report('sheet', `${sheet}: the prompt as typed is not its subjects' prompt`)
    }
  }
}

function checkCuration(pool: Pool, report: Report): void {
  const t = pool.template
  const gens = new Set(pool.generations.map(g => candidateKey(g.subject, g.candidate)))
  for (const d of pool.curation) {
    const what = `${d.subject} c${d.candidate}`
    if (!gens.has(candidateKey(d.subject, d.candidate))) report('curation', `${what}: decision on a candidate never generated`)
    if (d.decision !== 'accept' && d.decision !== 'reject') report('curation', `${what}: decision ${d.decision}`)
    if (d.decision === 'reject' && !REJECT_REASONS.includes(d.reason)) report('curation', `${what}: reject reason ${d.reason} is not one of ${REJECT_REASONS.join(', ')}`)
    for (const [name, value] of Object.entries(d.tags ?? {})) {
      if (!t.tags[name]?.includes(value)) report('tags', `${what}: tag ${name} = ${value} is not one the template allows`)
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
  const seen = new Set<string>()
  const encoders = new Set<string>()
  for (const img of pool.images) {
    const what = `image ${img.sha256.slice(0, 12)} (${img.subject} c${img.candidate})`
    if (seen.has(img.sha256)) report('images', `${what} appears twice`)
    seen.add(img.sha256)
    const g = gens.get(candidateKey(img.subject, img.candidate))
    if (!g) report('images', `${what}: no such generation`)
    else if (img.original !== g.sha256) report('original', `${what}: original ${img.original} is not the SHA-256 the generation log recorded`)
    if (img.template !== t.id || img.version !== t.version) report('images', `${what}: belongs to ${img.template} v${img.version}`)
    const s = subjects.get(img.subject)
    if (s && !sameJson(img.values, s.values)) report('values', `${what}: values differ from the subject's`)
    checkValues(t, img.values, what, report)
    const decision = last.get(candidateKey(img.subject, img.candidate))
    if (!decision) report('curation', `${what}: no accept in the curation log`)
    else if (decision.decision === 'accept' && !sameJson(img.tags, decision.tags ?? {})) report('tags', `${what}: tags differ from the accept's`)
    for (const [name, value] of Object.entries(img.tags)) if (!t.tags[name]?.includes(value)) report('tags', `${what}: tag ${name} = ${value} is not allowed`)
    if (img.quality !== t.served.quality) report('encoding', `${what}: quality ${img.quality}, template says ${t.served.quality}`)
    encoders.add(`${img.encoder} ${img.encoder_version}`)
    if (typeof img.signed !== 'boolean') report('images', `${what}: signed must be true or false`)
    if (img.width !== t.served.width || img.height !== t.served.height || img.format !== t.served.format) {
      report('served', `${what}: record says ${img.format} ${img.width}x${img.height}, template says ${t.served.format} ${t.served.width}x${t.served.height}`)
    }
    const file = join(files.served, `${img.sha256}.${extension(img.format)}`)
    if (!existsSync(file)) {
      report('served', `${what}: ${file} is missing`)
      continue
    }
    const bytes = readFileSync(file)
    if (sha256(bytes) !== img.sha256) report('served', `${what}: file content does not match its name`)
    if (bytes.length !== img.bytes) report('served', `${what}: ${bytes.length} bytes, record says ${img.bytes}`)
    const meta = await sharp(bytes).metadata()
    if (meta.format !== t.served.format || meta.width !== t.served.width || meta.height !== t.served.height) {
      report('served', `${what}: file is ${meta.format} ${meta.width}x${meta.height}, template says ${t.served.format} ${t.served.width}x${t.served.height}`)
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
  if (!Number.isInteger(set.n) || set.images.length !== set.n) report('sets', `N = ${set.n} but ${set.images.length} images`)
  if (new Set(set.images).size !== set.images.length) report('sets', 'an image appears twice')
  if (set.n < MIN_N) report('sets', `N = ${set.n} is under ${MIN_N}`)
  if (set.n > MAX_N && set.large !== true) report('sets', `N = ${set.n} is over ${MAX_N} and the set is not marked large`)
  for (const [name, values] of Object.entries(set.filter)) {
    if (!t.parameters[name]) report('sets', `filter names ${name}, not a parameter`)
    else for (const v of values) if (!(v in t.parameters[name]!)) report('sets', `filter allows ${name} = ${v}, not a value`)
  }
  const byHash = new Map(pool.images.map(i => [i.sha256, i]))
  for (const hash of set.images) {
    const img = byHash.get(hash)
    if (!img) report('sets', `${hash.slice(0, 12)} is not an image of ${pool.name}`)
    else if (pool.withdrawn.has(hash)) report('withdrawn', `${hash.slice(0, 12)} (${img.subject}) is withdrawn`)
    else if (set.published !== null && img.signed !== true) report('signed', `${hash.slice(0, 12)} (${img.subject}) is unsigned, in a published set`)
  }
  if (set.published !== null && (typeof set.published !== 'string' || Number.isNaN(Date.parse(set.published)))) report('sets', `published must be null or a date, not ${JSON.stringify(set.published)}`)
  try {
    const again = selectImages(t, pool.images, set.pool_images, pool.withdrawn, set.filter, set.n, set.seed)
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

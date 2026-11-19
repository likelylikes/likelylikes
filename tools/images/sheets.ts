// `sheets`: downloaded sheet images to subjects and generations (docs/image-pipeline.md §2.3a).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import sharp from 'sharp'
import { inputPath, parseCli, requirePool, run } from './lib/cli.ts'
import { describeSeam, verifyGrid } from './lib/grid.ts'
import { PyRandom } from './lib/pyrandom.ts'
import {
  MIN_INSET_FRACTIONAL, appendJsonl, cellCrop, combinations, escapeNonAscii, extension, isoSeconds, loadDesign,
  loadTemplate, normalisePrompt, paths, readJsonl, renderPrompt, sha256, sheetId, sheetNumber, subjectId,
  subjectNumber,
  type Design, type Generation, type Subject, type Template,
} from './lib/records.ts'
import { c2paTimestamp } from './lib/timestamp.ts'

const USAGE = `Usage: npm run images:sheets -- --pool <template>.v<n> [--dry-run] [--time <iso>] [--via <how>] <sheet>...

Adds sheet images, each a grid of the template's rows x columns square cells, to a pool: one subject
per cell. Beside each image goes its prompt as typed into the app, in a file of the same name ending
.md or .txt; the prompt picks the subject's parameter values, so it must be the template's prompt
with one value per slot. Each sheet is copied byte for byte to images/pools/<pool>/sheets/, and the
design's per_value counts are raised to match. Prompt files given among the sheets are ignored, so
a folder can be passed as <folder>/*.

  --dry-run   verify and print what would be added; write nothing
  --time      generation time, with its zone (2026-11-02T07:21:09Z), for one new sheet whose file
              has no C2PA time-stamp
  --via       how the file was obtained (default: browser download)

A sheet already in the pool, by SHA-256, is skipped before anything else, so the step can be re-run.`

export interface NewSheet {
  file: string
  bytes: Buffer
  sha256: string
  format: string
  width: number
  height: number
  values: Record<string, string>
  promptFile: string
  time: string
}

/** The one combination of values whose rendered prompt is the typed prompt, as normalisePrompt compares them. */
export function valuesForPrompt(t: Template, typed: string): Record<string, string> {
  const want = normalisePrompt(typed)
  const matches = combinations(t).filter(c => normalisePrompt(renderPrompt(t, c)) === want)
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`prompt matches ${matches.length} value combinations; the template has a slot the prompt does not show`)
  // Point at the first difference from the nearest rendering, to make a typo easy to find.
  let best = { at: -1, text: '' }
  for (const c of combinations(t)) {
    const text = normalisePrompt(renderPrompt(t, c))
    let at = 0
    while (at < text.length && at < want.length && text[at] === want[at]) at++
    if (at > best.at) best = { at, text }
  }
  const around = (s: string) => escapeNonAscii(JSON.stringify(s.slice(Math.max(0, best.at - 30), best.at + 30)))
  throw new Error(`prompt is not the template's prompt with one value per slot; first difference at character ${best.at}:\n  typed:    ${around(want)}\n  template: ${around(best.text)}`)
}

export function promptFileFor(file: string): string {
  const stem = join(dirname(file), basename(file, extname(file)))
  for (const ext of ['.md', '.txt']) if (existsSync(stem + ext)) return stem + ext
  throw new Error(`no prompt file beside it (${basename(stem)}.md or .txt)`)
}

/** A --time as the records write time: needs a zone, so it means the same on any machine. */
export function parseTime(time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(time)) {
    throw new Error(`--time must be an ISO 8601 time with its zone, such as 2026-11-02T07:21:09Z, not ${time}`)
  }
  const ms = Date.parse(time)
  if (Number.isNaN(ms)) throw new Error(`--time is not a date: ${time}`)
  return isoSeconds(new Date(Math.floor(ms / 1000) * 1000))
}

export async function inspectSheet(t: Template, file: string, bytes: Buffer, time?: string): Promise<NewSheet> {
  if (!t.sheet) throw new Error(`template ${t.id} v${t.version} does not generate sheets`)
  const meta = await sharp(bytes).metadata()
  const format = meta.format
  if (format !== 'jpeg' && format !== 'png' && format !== 'webp') throw new Error(`${format} is not a JPEG, PNG or WebP`)
  if (meta.orientation !== undefined && meta.orientation !== 1) throw new Error(`EXIF orientation ${meta.orientation}: the pixels are stored rotated, and cells are cut from stored pixels`)
  const { rows, columns } = t.sheet
  const inset = t.sheet.inset ?? 0
  const grid = await verifyGrid(bytes, rows, columns)
  if (!grid.ok) {
    const bad = grid.seams.filter(s => !s.ok).map(s => '  ' + describeSeam(s)).join('\n')
    throw new Error(`cells are not on the ${rows}x${columns} grid lines:\n${bad}`)
  }
  if (!grid.exact && inset < MIN_INSET_FRACTIONAL) throw new Error(`${grid.width}x${grid.height} does not divide into ${rows}x${columns} whole-pixel cells, so the template's inset must be at least ${MIN_INSET_FRACTIONAL}`)
  const served = grid.cell - 2 * inset
  if (served < t.served.width || served < t.served.height) {
    throw new Error(`cells are ${grid.cell} px, ${served} px less the inset, smaller than the served ${t.served.width}x${t.served.height}`)
  }
  const promptFile = promptFileFor(file)
  let values
  try {
    values = valuesForPrompt(t, readFileSync(promptFile, 'utf8'))
  } catch (e) {
    throw new Error(`${promptFile}: ${(e as Error).message}`)
  }
  const stamped = c2paTimestamp(bytes)
  if (stamped && time) throw new Error(`the file has a C2PA time-stamp (${stamped}); --time is only for a file without one`)
  if (!stamped && !time) throw new Error('no C2PA time-stamp; give the generation time with --time')
  return { file, bytes, sha256: sha256(bytes), format, width: grid.width, height: grid.height, values, promptFile, time: stamped ?? parseTime(time!) }
}

export interface Plan {
  sheets: Array<NewSheet & { id: string }>
  subjects: Subject[]
  generations: Generation[]
  /** The design's per_value after these sheets, or null when unchanged. */
  perValue: Record<string, number> | null
}

/**
 * Numbers new sheets in generation order after the pool's last sheet, and their cells as subjects
 * after the pool's last subject, in an order shuffled from the design's seed plus the number of
 * subjects already in the pool: random.Random(seed).shuffle(cells), cells listed sheet by sheet,
 * row by row. Raises per_value where the pool now holds more subjects of a value than it says.
 */
export function plan(t: Template, design: Design, existingSubjects: Subject[], existingGenerations: Generation[], fresh: NewSheet[], via: string): Plan {
  const sorted = [...fresh].sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.sha256.localeCompare(b.sha256))
  const lastSheet = Math.max(0, ...existingGenerations.filter(g => g.sheet).map(g => sheetNumber(g.sheet!)))
  const sheets = sorted.map((s, i) => ({ ...s, id: sheetId(lastSheet + i + 1) }))
  const { rows, columns } = t.sheet!
  const cells = sheets.flatMap(s => Array.from({ length: rows * columns }, (_, k) => ({ s, row: Math.floor(k / columns) + 1, column: (k % columns) + 1 })))
  new PyRandom(design.seed + existingSubjects.length).shuffle(cells)
  const lastSubject = Math.max(0, ...existingSubjects.map(s => subjectNumber(s.subject)))
  const subjects: Subject[] = []
  const generations: Generation[] = []
  cells.forEach(({ s, row, column }, i) => {
    const subject = subjectId(lastSubject + i + 1)
    subjects.push({ subject, values: s.values, prompt: renderPrompt(t, s.values), sheet: s.id, cell: { row, column } })
    generations.push({
      subject, candidate: 1, sheet: s.id, sha256: s.sha256, crop: cellCrop(s.width, s.height, rows, columns, row, column),
      width: s.width, height: s.height, format: s.format, provider: t.model.provider,
      ...(t.model.service !== undefined ? { service: t.model.service } : {}),
      model: t.model.id, settings: t.settings, via, time: s.time,
    })
  })
  const perValue = { ...design.per_value }
  let changed = false
  for (const value of new Set(subjects.map(s => s.values[design.stratify]!))) {
    const total = [...existingSubjects, ...subjects].filter(s => s.values[design.stratify] === value).length
    if (total > (perValue[value] ?? 0)) {
      perValue[value] = total
      changed = true
    }
  }
  return { sheets, subjects, generations, perValue: changed ? perValue : null }
}

export interface IngestReport {
  plan: Plan
  skipped: Array<{ file: string; sheet: string }>
  ignored: string[]
}

/** Verifies every new sheet, then (unless dryRun) writes the sheets, the design and the logs, in that order. */
export async function ingest(root: string, pool: string, files: string[], opts: { time?: string; via?: string; dryRun?: boolean } = {}): Promise<IngestReport> {
  const t = loadTemplate(root, pool)
  if (!t.sheet) throw new Error(`template ${pool} does not generate sheets`)
  const p = paths(root, pool)
  const design = loadDesign(root, pool, t)
  const existingSubjects = readJsonl<Subject>(p.subjects)
  const existingGenerations = readJsonl<Generation>(p.generations)
  const known = new Map(existingGenerations.filter(g => g.sheet).map(g => [g.sha256, g.sheet!]))
  const ignored: string[] = []
  const skipped: IngestReport['skipped'] = []
  const candidates: Array<{ file: string; bytes: Buffer }> = []
  const seen = new Set<string>()
  // Skip what the pool already has before anything else, so a re-run never trips on an old sheet.
  for (const file of files) {
    if (/\.(md|txt)$/i.test(file)) {
      ignored.push(file)
      continue
    }
    const bytes = readFileSync(file)
    const hash = sha256(bytes)
    const sheet = known.get(hash)
    if (sheet) skipped.push({ file, sheet })
    else if (!seen.has(hash)) {
      seen.add(hash)
      candidates.push({ file, bytes })
    }
  }
  if (opts.time && candidates.length !== 1) throw new Error(`--time is for one new sheet; ${candidates.length} are new`)
  const fresh: NewSheet[] = []
  for (const c of candidates) {
    try {
      fresh.push(await inspectSheet(t, c.file, c.bytes, opts.time))
    } catch (e) {
      throw new Error(`${c.file}: ${(e as Error).message}`)
    }
  }
  // Every original in a pool has one size (images.md §8).
  const size = existingGenerations[0] ? { width: existingGenerations[0].width, height: existingGenerations[0].height } : fresh[0]
  for (const s of fresh) {
    if (size && (s.width !== size.width || s.height !== size.height)) {
      throw new Error(`${s.file}: ${s.width}x${s.height}, but the pool's sheets are ${size.width}x${size.height}; every original in a pool has one size`)
    }
  }
  const pl = plan(t, design, existingSubjects, existingGenerations, fresh, opts.via ?? 'browser download')
  if (!opts.dryRun) write(root, pool, pl, design)
  return { plan: pl, skipped, ignored }
}

/**
 * Writes sheets first, then the design, then the logs, so an interrupted run can be repeated: a
 * sheet file already there with the same bytes is fine, and the logs decide what is in the pool.
 */
export function write(root: string, pool: string, pl: Plan, design: Design): void {
  const files = paths(root, pool)
  const writes: Array<{ path: string; bytes: Buffer }> = []
  for (const s of pl.sheets) {
    writes.push({ path: join(files.sheets, `${s.id}.${extension(s.format)}`), bytes: s.bytes })
    writes.push({ path: join(files.sheets, `${s.id}.md`), bytes: readFileSync(s.promptFile) })
  }
  for (const w of writes) {
    if (existsSync(w.path) && !readFileSync(w.path).equals(w.bytes)) throw new Error(`${w.path} exists with other content; sheets are never overwritten`)
  }
  mkdirSync(files.sheets, { recursive: true })
  for (const w of writes) if (!existsSync(w.path)) writeFileSync(w.path, w.bytes)
  if (pl.perValue) writeFileSync(files.design, JSON.stringify({ ...design, per_value: pl.perValue }, null, 2) + '\n')
  appendJsonl(files.subjects, pl.subjects)
  appendJsonl(files.generations, pl.generations)
}

async function main(): Promise<void> {
  const { values: opts, positionals, root } = parseCli(USAGE, {
    'dry-run': { type: 'boolean' },
    time: { type: 'string' },
    via: { type: 'string' },
  }, true)
  const pool = requirePool(opts.pool, USAGE)
  if (!positionals.length) throw new Error(`no sheet images given\n\n${USAGE}`)
  const report = await ingest(root, pool, positionals.map(inputPath), { time: opts.time, via: opts.via, dryRun: opts['dry-run'] })
  for (const s of report.skipped) console.log(`skip ${s.file}: already in ${pool} as ${s.sheet}`)
  const pl = report.plan
  for (const s of pl.sheets) {
    const n = pl.subjects.filter(x => x.sheet === s.id)
    console.log(`${s.id} ${s.file}: ${JSON.stringify(s.values)}, ${s.width}x${s.height} ${s.format}, ${s.time}, subjects ${n.map(x => x.subject).join(' ')}`)
  }
  if (pl.perValue) console.log(`design per_value: ${JSON.stringify(pl.perValue)}`)
  if (opts['dry-run']) {
    console.log('dry run: nothing written')
    return
  }
  console.log(`added ${pl.sheets.length} sheets, ${pl.subjects.length} subjects to ${pool}`)
}

if (import.meta.main) run(main)

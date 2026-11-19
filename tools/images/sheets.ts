// `sheets`: downloaded sheet images to subjects and generations (docs/image-pipeline.md §2.3a).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import sharp from 'sharp'
import { parseCli, requirePool, run } from './lib/cli.ts'
import { describeSeam, verifyGrid } from './lib/grid.ts'
import { PyRandom } from './lib/pyrandom.ts'
import {
  appendJsonl, combinations, extension, loadTemplate, paths, readJson, readJsonl, renderPrompt, sha256,
  sheetId, sheetNumber, subjectId, subjectNumber,
  type Design, type Generation, type Subject, type Template,
} from './lib/records.ts'
import { c2paTimestamp } from './lib/timestamp.ts'

const USAGE = `Usage: npm run images:sheets -- --pool <template>.v<n> [--dry-run] [--time <iso>] [--via <how>] <sheet>...

Adds sheet images, each a grid of the template's rows x columns cells, to a pool: one subject per
cell. Beside each image goes its prompt as typed into the app, in a file of the same name ending
.md or .txt; the prompt picks the subject's parameter values, so it must be the template's prompt
with one value per slot. Each sheet is copied byte for byte to images/pools/<pool>/sheets/.

  --dry-run   verify and print what would be added; write nothing
  --time      generation time for a single sheet whose file has no C2PA time-stamp
  --via       how the file was obtained (default: browser download)

A sheet already in the pool, by SHA-256, is skipped, so the step can be re-run.`

export interface NewSheet {
  file: string
  bytes: Buffer
  sha256: string
  format: string
  width: number
  height: number
  cell: number
  values: Record<string, string>
  promptFile: string
  time: string
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The one combination of values whose rendered prompt is the typed prompt, whitespace aside. */
export function valuesForPrompt(t: Template, typed: string): Record<string, string> {
  const want = normalise(typed)
  const matches = combinations(t).filter(c => normalise(renderPrompt(t, c)) === want)
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`prompt matches ${matches.length} value combinations; the template has a slot the prompt does not show`)
  // Point at the first difference from the nearest rendering, to make a typo easy to find.
  let best = { at: -1, text: '' }
  for (const c of combinations(t)) {
    const text = normalise(renderPrompt(t, c))
    let at = 0
    while (at < text.length && at < want.length && text[at] === want[at]) at++
    if (at > best.at) best = { at, text }
  }
  const around = (s: string) => JSON.stringify(s.slice(Math.max(0, best.at - 30), best.at + 30))
  throw new Error(`prompt is not the template's prompt with one value per slot; first difference at character ${best.at}:\n  typed:    ${around(want)}\n  template: ${around(best.text)}`)
}

export function promptFileFor(file: string): string {
  const stem = join(dirname(file), basename(file, extname(file)))
  for (const ext of ['.md', '.txt']) if (existsSync(stem + ext)) return stem + ext
  throw new Error(`${file}: no prompt file beside it (${basename(stem)}.md or .txt)`)
}

export async function inspectSheet(t: Template, file: string, time?: string): Promise<NewSheet> {
  if (!t.sheet) throw new Error(`template ${t.id} v${t.version} does not generate sheets`)
  const bytes = readFileSync(file)
  const meta = await sharp(bytes).metadata()
  const format = meta.format
  if (format !== 'jpeg' && format !== 'png' && format !== 'webp') throw new Error(`${file}: ${format} is not a JPEG, PNG or WebP`)
  const { rows, columns } = t.sheet
  const grid = await verifyGrid(bytes, rows, columns)
  if (!grid.ok) {
    const bad = grid.seams.filter(s => !s.ok).map(s => '  ' + describeSeam(s)).join('\n')
    throw new Error(`${file}: cells are not on the ${rows}x${columns} grid lines:\n${bad}`)
  }
  if (grid.cell < t.served.width || grid.cell < t.served.height) {
    throw new Error(`${file}: cells are ${grid.cell} px, smaller than the served ${t.served.width}x${t.served.height}`)
  }
  const promptFile = promptFileFor(file)
  let values
  try {
    values = valuesForPrompt(t, readFileSync(promptFile, 'utf8'))
  } catch (e) {
    throw new Error(`${promptFile}: ${(e as Error).message}`)
  }
  const stamped = c2paTimestamp(bytes)
  const when = stamped ?? time
  if (!when) throw new Error(`${file}: no C2PA time-stamp; give the generation time with --time`)
  if (Number.isNaN(Date.parse(when))) throw new Error(`--time is not a date: ${when}`)
  return { file, bytes, sha256: sha256(bytes), format, width: grid.width, height: grid.height, cell: grid.cell, values, promptFile, time: when }
}

export interface Plan {
  sheets: Array<NewSheet & { id: string }>
  subjects: Subject[]
  generations: Generation[]
  skipped: Array<{ file: string; sheet: string }>
}

/**
 * Numbers new sheets in generation order after the pool's last sheet, and their cells as subjects
 * after the pool's last subject, in an order shuffled from the design's seed plus the number of
 * subjects already in the pool: random.Random(seed).shuffle(cells), cells listed sheet by sheet,
 * row by row.
 */
export function plan(t: Template, design: Design, existingSubjects: Subject[], existingGenerations: Generation[], incoming: NewSheet[], via: string): Plan {
  const known = new Map(existingGenerations.filter(g => g.sheet).map(g => [g.sha256, g.sheet!]))
  const skipped: Plan['skipped'] = []
  const fresh: NewSheet[] = []
  const seen = new Set<string>()
  for (const s of incoming) {
    const sheet = known.get(s.sha256)
    if (sheet) skipped.push({ file: s.file, sheet })
    else if (!seen.has(s.sha256)) {
      seen.add(s.sha256)
      fresh.push(s)
    }
  }
  fresh.sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.sha256.localeCompare(b.sha256))
  const lastSheet = Math.max(0, ...existingGenerations.filter(g => g.sheet).map(g => sheetNumber(g.sheet!)))
  const sheets = fresh.map((s, i) => ({ ...s, id: sheetId(lastSheet + i + 1) }))
  const { rows, columns } = t.sheet!
  const cells = sheets.flatMap(s => Array.from({ length: rows * columns }, (_, k) => ({ s, row: Math.floor(k / columns) + 1, column: (k % columns) + 1 })))
  new PyRandom(design.seed + existingSubjects.length).shuffle(cells)
  const lastSubject = Math.max(0, ...existingSubjects.map(s => subjectNumber(s.subject)))
  const subjects: Subject[] = []
  const generations: Generation[] = []
  cells.forEach(({ s, row, column }, i) => {
    const subject = subjectId(lastSubject + i + 1)
    subjects.push({ subject, values: s.values, prompt: renderPrompt(t, s.values), sheet: s.id, cell: { row, column } })
    const g: Generation = {
      subject, candidate: 1, sheet: s.id, sha256: s.sha256,
      crop: { x: (column - 1) * s.cell, y: (row - 1) * s.cell, width: s.cell, height: s.cell },
      width: s.width, height: s.height, format: s.format, provider: t.model.provider,
      ...(t.model.service !== undefined ? { service: t.model.service } : {}),
      model: t.model.id, settings: t.settings, via, time: s.time,
    }
    generations.push(g)
  })
  return { sheets, subjects, generations, skipped }
}

export function write(root: string, pool: string, p: Plan): void {
  const files = paths(root, pool)
  mkdirSync(files.sheets, { recursive: true })
  for (const s of p.sheets) {
    const image = join(files.sheets, `${s.id}.${extension(s.format)}`)
    const prompt = join(files.sheets, `${s.id}.md`)
    for (const f of [image, prompt]) if (existsSync(f)) throw new Error(`${f} exists; sheets are never overwritten`)
  }
  for (const s of p.sheets) {
    writeFileSync(join(files.sheets, `${s.id}.${extension(s.format)}`), s.bytes)
    writeFileSync(join(files.sheets, `${s.id}.md`), readFileSync(s.promptFile))
  }
  appendJsonl(files.subjects, p.subjects)
  appendJsonl(files.generations, p.generations)
}

async function main(): Promise<void> {
  const { values: opts, positionals, root } = parseCli(USAGE, {
    'dry-run': { type: 'boolean' },
    time: { type: 'string' },
    via: { type: 'string' },
  }, true)
  const pool = requirePool(opts.pool, USAGE)
  if (!positionals.length) throw new Error(`no sheet images given\n\n${USAGE}`)
  if (opts.time && positionals.length > 1) throw new Error('--time is for a single sheet; give the sheets one at a time')
  const t = loadTemplate(root, pool)
  const files = paths(root, pool)
  const design = readJson<Design>(files.design)
  // Verify every sheet before writing anything.
  const incoming: NewSheet[] = []
  for (const file of positionals) incoming.push(await inspectSheet(t, file, opts.time))
  const p = plan(t, design, readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), incoming, opts.via ?? 'browser download')
  for (const s of p.skipped) console.log(`skip ${s.file}: already in ${pool} as ${s.sheet}`)
  for (const s of p.sheets) {
    const n = p.subjects.filter(x => x.sheet === s.id)
    console.log(`${s.id} ${s.file}: ${JSON.stringify(s.values)}, ${s.width}x${s.height} ${s.format}, ${s.time}, subjects ${n.map(x => x.subject).join(' ')}`)
  }
  if (opts['dry-run']) {
    console.log('dry run: nothing written')
    return
  }
  write(root, pool, p)
  console.log(`added ${p.sheets.length} sheets, ${p.subjects.length} subjects to ${pool}`)
}

if (import.meta.main) run(main)

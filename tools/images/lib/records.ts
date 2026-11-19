// Records of docs/images.md §7 and their files (docs/image-pipeline.md §1).

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root: tools/images/lib/ is three levels down. */
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export interface Template {
  id: string
  version: number
  question: string
  prompt: string
  parameters: Record<string, Record<string, string>>
  exclusions: Array<Record<string, string>>
  tags: Record<string, string[]>
  /** A sheet template: the grid, and the pixels trimmed from each side of a cell when it is served. */
  sheet?: { rows: number; columns: number; inset?: number }
  model: { provider: string; service?: string; id: string | null; version: string | null }
  settings: Record<string, unknown>
  served: { width: number; height: number; format: string; quality: number }
}

export interface Design {
  template: string
  version: number
  stratify: string
  per_value: Record<string, number>
  balance: string[]
  seed: number
}

export interface Cell {
  row: number
  column: number
}

export interface Subject {
  subject: string
  values: Record<string, string>
  prompt: string
  sheet?: string
  cell?: Cell
}

export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

export interface Generation {
  subject: string
  candidate: number
  sheet?: string
  sha256: string
  crop?: Crop
  width: number
  height: number
  format: string
  provider: string
  service?: string
  model: string | null
  settings: Record<string, unknown>
  seed?: number
  request_id?: string
  via?: string
  time: string
}

export interface Decision {
  subject: string
  candidate: number
  decision: 'accept' | 'reject'
  reason: string
  note: string
  tags: Record<string, string>
  time: string
}

export interface ImageRecord {
  sha256: string
  original: string
  template: string
  version: number
  subject: string
  candidate: number
  values: Record<string, string>
  tags: Record<string, string>
  width: number
  height: number
  format: string
  bytes: number
  quality: number
  encoder: string
  encoder_version: string
  signed: boolean
  time: string
}

export interface SetRecord {
  set_id: string
  template: string
  version: number
  filter: Record<string, string[]>
  n: number
  large: boolean
  seed: number
  /** The images the selection chose from, in the order it shuffled them from. */
  considered: string[]
  images: string[]
  published: string | null
}

export const REJECT_REASONS = ['defect', 'style', 'parameters', 'age', 'likeness'] as const

/** Own properties only: a parameter or value named `toString` must not match Object.prototype. */
export const has = (o: object, key: string): boolean => Object.hasOwn(o, key)

/** A pool is named for its template version: `women-profiles.v1`. */
export function parsePool(pool: string): { template: string; version: number } {
  const m = /^([a-z0-9][a-z0-9-]*)\.v([1-9][0-9]*)$/.exec(pool)
  if (!m) throw new Error(`not a pool name (want <template>.v<n>): ${pool}`)
  return { template: m[1]!, version: Number(m[2]) }
}

export function poolName(template: string, version: number): string {
  return `${template}.v${version}`
}

export function paths(root: string, pool: string) {
  const dir = join(root, 'images', 'pools', pool)
  return {
    template: join(root, 'images', 'templates', `${pool}.json`),
    dir,
    design: join(dir, 'design.json'),
    subjects: join(dir, 'subjects.jsonl'),
    generations: join(dir, 'generations.jsonl'),
    curation: join(dir, 'curation.jsonl'),
    images: join(dir, 'images.jsonl'),
    sheets: join(dir, 'sheets'),
    served: join(dir, 'served'),
    candidates: join(root, 'work', pool, 'candidates'),
  }
}

export function setsDir(root: string): string {
  return join(root, 'images', 'sets')
}

export function listPools(root: string): string[] {
  const dir = join(root, 'images', 'pools')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
}

export function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`)
  }
}

/** JSON Lines; a missing file is an empty log. */
export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  const out: T[] = []
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return
    try {
      out.push(JSON.parse(line) as T)
    } catch (e) {
      throw new Error(`${file}:${i + 1}: not JSON: ${(e as Error).message}`)
    }
  })
  return out
}

/** Non-ASCII as \uXXXX, the way Python's json.dumps writes it. */
export function escapeNonAscii(s: string): string {
  return s.replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

/**
 * One compact JSON line, written the way the first records were (Python's json.dumps with
 * separators=(",", ":")): non-ASCII escaped as \uXXXX, so the logs stay byte-comparable.
 */
export function jsonLine(value: unknown): string {
  return escapeNonAscii(JSON.stringify(value))
}

/** Appends lines to a log, never rewriting what is there (image-pipeline.md §1). */
export function appendJsonl(file: string, values: unknown[]): void {
  if (!values.length) return
  mkdirSync(dirname(file), { recursive: true })
  const existing = existsSync(file) ? readFileSync(file) : null
  const lead = existing && existing.length && existing[existing.length - 1] !== 0x0a ? '\n' : ''
  appendFileSync(file, lead + values.map(v => jsonLine(v) + '\n').join(''))
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Time as the records write it: 2026-11-02T07:21:09+00:00. */
export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

export function extension(format: string): string {
  const ext: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
  if (!has(ext, format)) throw new Error(`unsupported image format: ${format}`)
  return ext[format]!
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isPositiveInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0
const isSeed = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/** What is wrong with a hand-written template, as messages; empty when it is sound. */
export function templateProblems(t: Template): string[] {
  const out: string[] = []
  const v = t as unknown as Record<string, unknown>
  if (typeof v['id'] !== 'string') out.push('id must be a string')
  if (!isPositiveInt(v['version'])) out.push('version must be a positive integer')
  if (typeof v['question'] !== 'string') out.push('question must be a string')
  if (typeof v['prompt'] !== 'string') out.push('prompt must be a string')
  if (!isObject(v['parameters'])) out.push('parameters must be an object')
  else {
    for (const [name, values] of Object.entries(v['parameters'])) {
      if (!isObject(values) || !Object.keys(values).length) out.push(`parameter ${name} must map values to fragments`)
      else for (const [value, fragment] of Object.entries(values)) if (typeof fragment !== 'string') out.push(`parameter ${name} value ${value}: fragment must be a string`)
    }
  }
  if (!Array.isArray(v['exclusions'])) out.push('exclusions must be a list')
  else if (isObject(v['parameters'])) {
    for (const ex of v['exclusions'] as unknown[]) {
      if (!isObject(ex) || !Object.keys(ex).length) out.push(`exclusion ${JSON.stringify(ex)} must be a non-empty object`)
      else for (const [name, value] of Object.entries(ex)) {
        const values = (v['parameters'] as Record<string, unknown>)[name]
        if (!has(v['parameters'] as object, name) || !isObject(values) || typeof value !== 'string' || !has(values, value)) out.push(`exclusion names ${name} = ${String(value)}, not a parameter value`)
      }
    }
  }
  if (!isObject(v['tags'])) out.push('tags must be an object')
  else for (const [name, values] of Object.entries(v['tags'])) if (!Array.isArray(values) || values.some(x => typeof x !== 'string')) out.push(`tag ${name} must list strings`)
  if (v['sheet'] !== undefined) {
    const s = v['sheet']
    if (!isObject(s) || !isPositiveInt(s['rows']) || !isPositiveInt(s['columns'])) out.push('sheet must give positive integer rows and columns')
    else if (s['inset'] !== undefined && !(Number.isInteger(s['inset']) && (s['inset'] as number) >= 0)) out.push('sheet inset must be a non-negative integer')
  }
  const m = v['model']
  if (!isObject(m) || typeof m['provider'] !== 'string' || !(m['id'] === null || typeof m['id'] === 'string') || !(m['version'] === null || typeof m['version'] === 'string')) {
    out.push('model must give provider, id (or null) and version (or null)')
  }
  if (!isObject(v['settings'])) out.push('settings must be an object')
  const s = v['served']
  if (!isObject(s) || !isPositiveInt(s['width']) || !isPositiveInt(s['height']) || typeof s['format'] !== 'string' || !(Number.isInteger(s['quality']) && (s['quality'] as number) >= 1 && (s['quality'] as number) <= 100)) {
    out.push('served must give positive width and height, a format and a quality of 1 to 100')
  }
  return out
}

/** What is wrong with a pool design for its template, as messages. */
export function designProblems(d: Design, t: Template): string[] {
  const out: string[] = []
  if (d.template !== t.id || d.version !== t.version) out.push(`design is for ${d.template} v${d.version}`)
  if (typeof d.stratify !== 'string' || !has(t.parameters, d.stratify)) out.push(`stratify parameter ${d.stratify} is not in the template`)
  if (!Array.isArray(d.balance)) out.push('balance must be a list')
  else for (const name of d.balance) {
    if (!has(t.parameters, name)) out.push(`balance names ${name}, not a parameter`)
    if (name === d.stratify) out.push(`balance names the stratify parameter ${name}`)
  }
  if (!isObject(d.per_value)) out.push('per_value must be an object')
  else for (const [value, count] of Object.entries(d.per_value)) {
    if (has(t.parameters, d.stratify) && !has(t.parameters[d.stratify]!, value)) out.push(`per_value names ${d.stratify} = ${value}, not a value`)
    if (!(Number.isInteger(count) && count >= 0)) out.push(`per_value ${value} must be a non-negative integer`)
  }
  if (!isSeed(d.seed)) out.push(`seed must be a non-negative integer, not ${JSON.stringify(d.seed)}`)
  return out
}

export function loadTemplate(root: string, pool: string): Template {
  const p = paths(root, pool)
  if (!existsSync(p.template)) throw new Error(`no template for pool ${pool}: ${p.template}`)
  const t = readJson<Template>(p.template)
  const problems = templateProblems(t)
  if (problems.length) throw new Error(`${p.template}: ${problems.join('; ')}`)
  const { template, version } = parsePool(pool)
  if (t.id !== template || t.version !== version) throw new Error(`${p.template} is ${t.id} v${t.version}, not ${pool}`)
  return t
}

export function loadDesign(root: string, pool: string, t: Template): Design {
  const file = paths(root, pool).design
  if (!existsSync(file)) throw new Error(`no design for pool ${pool}: ${file}`)
  const d = readJson<Design>(file)
  const problems = designProblems(d, t)
  if (problems.length) throw new Error(`${file}: ${problems.join('; ')}`)
  return d
}

/** Replaces every {name} with its value's fragment; an unknown or unfilled slot is an error (image-pipeline.md §2.1). */
export function renderPrompt(t: Template, values: Record<string, string>): string {
  return t.prompt.replace(/\{([^{}]*)\}/g, (_m, name: string) => {
    if (!has(t.parameters, name)) throw new Error(`template ${t.id} v${t.version}: unknown slot {${name}}`)
    const fragments = t.parameters[name]!
    if (!has(values, name)) throw new Error(`template ${t.id} v${t.version}: slot {${name}} has no value`)
    const value = values[name]!
    if (!has(fragments, value)) throw new Error(`template ${t.id} v${t.version}: ${name} has no value ${value}`)
    return fragments[value]!
  })
}

/**
 * A prompt as compared with its template: Unicode compatibility forms folded (NFKC), typographic
 * quotes and dashes made plain, whitespace collapsed. What an app or editor changes when the
 * prompt is pasted does not count as a difference.
 */
export function normalisePrompt(s: string): string {
  return s.normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isExcluded(t: Template, values: Record<string, string>): boolean {
  return t.exclusions.some(ex => Object.entries(ex).every(([k, v]) => values[k] === v))
}

/** Every combination of parameter values, in template order, minus the exclusions it determines. */
export function combinations(t: Template, names: string[] = Object.keys(t.parameters)): Array<Record<string, string>> {
  let out: Array<Record<string, string>> = [{}]
  for (const name of names) {
    const values = has(t.parameters, name) ? Object.keys(t.parameters[name]!) : []
    out = out.flatMap(c => values.map(v => ({ ...c, [name]: v })))
  }
  return out.filter(c => !isExcluded(t, c))
}

/**
 * The cell at (row, column), 1-based, of a sheet's rows x columns grid: its top left on the grid
 * line at round(k * size / count), its side the floor of the cell size. On a grid that divides the
 * sheet exactly, that is the cell itself.
 */
export function cellCrop(width: number, height: number, rows: number, columns: number, row: number, column: number): Crop {
  const side = Math.floor(width / columns)
  return { x: Math.round(((column - 1) * width) / columns), y: Math.round(((row - 1) * height) / rows), width: side, height: side }
}

/** True when the grid lines fall on whole pixels. */
export function exactGrid(width: number, height: number, rows: number, columns: number): boolean {
  return width % columns === 0 && height % rows === 0
}

/** A grid that does not divide its sheet puts each line within a pixel of where it should be; the inset must cover that. */
export const MIN_INSET_FRACTIONAL = 2

/** The part of a candidate that is served: a sheet's cell less the template's inset on every side. */
export function servedRegion(t: Template, crop: Crop): Crop {
  const inset = t.sheet?.inset ?? 0
  return { x: crop.x + inset, y: crop.y + inset, width: crop.width - 2 * inset, height: crop.height - 2 * inset }
}

/** The last decision per candidate wins (image-pipeline.md §1). */
export function lastDecisions(curation: Decision[]): Map<string, Decision> {
  const last = new Map<string, Decision>()
  for (const d of curation) last.set(candidateKey(d.subject, d.candidate), d)
  return last
}

export function candidateKey(subject: string, candidate: number): string {
  return `${subject}-c${candidate}`
}

/** An image is withdrawn when its candidate was rejected after it was encoded (images.md §8). */
export function withdrawnImages(images: ImageRecord[], curation: Decision[]): Set<string> {
  const last = lastDecisions(curation)
  return new Set(images.filter(i => last.get(candidateKey(i.subject, i.candidate))?.decision === 'reject').map(i => i.sha256))
}

/** Subject IDs from a comma-separated list, each checked against the pool's subjects. */
export function parseSubjects(list: string, subjects: Subject[]): string[] {
  const known = new Set(subjects.map(s => s.subject))
  const ids = [...new Set(list.split(',').map(s => s.trim()).filter(Boolean))]
  if (!ids.length) throw new Error('no subjects given')
  for (const id of ids) if (!known.has(id)) throw new Error(`no subject ${id} in the pool`)
  return ids
}

export function subjectNumber(id: string): number {
  const m = /^s(\d{3,})$/.exec(id)
  if (!m) throw new Error(`not a subject ID: ${id}`)
  return Number(m[1])
}

export function subjectId(n: number): string {
  return `s${String(n).padStart(3, '0')}`
}

export function sheetNumber(id: string): number {
  const m = /^g(\d{2,})$/.exec(id)
  if (!m) throw new Error(`not a sheet ID: ${id}`)
  return Number(m[1])
}

export function sheetId(n: number): string {
  return `g${String(n).padStart(2, '0')}`
}

/** Compares JSON-shaped values by content, ignoring key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]))
  }
  return v
}

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
  sheet?: { rows: number; columns: number }
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
  pool_images: number
  images: string[]
  published: string | null
}

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
  return JSON.parse(readFileSync(file, 'utf8')) as T
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

/**
 * One compact JSON line, written the way the first records were (Python's json.dumps with
 * separators=(",", ":")): non-ASCII escaped as \uXXXX, so the logs stay byte-comparable.
 */
export function jsonLine(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

/** Appends lines to a log, never rewriting what is there (image-pipeline.md §1). */
export function appendJsonl(file: string, values: unknown[]): void {
  if (!values.length) return
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, values.map(v => jsonLine(v) + '\n').join(''))
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
  const e = ext[format]
  if (!e) throw new Error(`unsupported image format: ${format}`)
  return e
}

export function loadTemplate(root: string, pool: string): Template {
  const p = paths(root, pool)
  if (!existsSync(p.template)) throw new Error(`no template for pool ${pool}: ${p.template}`)
  const t = readJson<Template>(p.template)
  const { template, version } = parsePool(pool)
  if (t.id !== template || t.version !== version) throw new Error(`${p.template} is ${t.id} v${t.version}, not ${pool}`)
  return t
}

/** Replaces every {name} with its value's fragment; an unknown or unfilled slot is an error (image-pipeline.md §2.1). */
export function renderPrompt(t: Template, values: Record<string, string>): string {
  return t.prompt.replace(/\{([^{}]*)\}/g, (_m, name: string) => {
    const fragments = t.parameters[name]
    if (!fragments) throw new Error(`template ${t.id} v${t.version}: unknown slot {${name}}`)
    const value = values[name]
    if (value === undefined) throw new Error(`template ${t.id} v${t.version}: slot {${name}} has no value`)
    const fragment = fragments[value]
    if (fragment === undefined) throw new Error(`template ${t.id} v${t.version}: ${name} has no value ${value}`)
    return fragment
  })
}

export function isExcluded(t: Template, values: Record<string, string>): boolean {
  return t.exclusions.some(ex => Object.entries(ex).every(([k, v]) => values[k] === v))
}

/** Every combination of parameter values, in template order, minus the exclusions. */
export function combinations(t: Template, names: string[] = Object.keys(t.parameters)): Array<Record<string, string>> {
  let out: Array<Record<string, string>> = [{}]
  for (const name of names) {
    const values = Object.keys(t.parameters[name] ?? {})
    out = out.flatMap(c => values.map(v => ({ ...c, [name]: v })))
  }
  return out.filter(c => !isExcluded(t, c))
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

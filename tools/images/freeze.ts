// `freeze`: a filter over a pool to a frozen set (docs/image-pipeline.md §2.7).

import { randomInt } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCli, requirePool, run } from './lib/cli.ts'
import {
  has, loadTemplate, paths, readJsonl, setsDir, withdrawnImages,
  type Decision, type ImageRecord, type SetRecord, type Template,
} from './lib/records.ts'
import { consider, selectFrom } from './lib/select.ts'

const USAGE = `Usage: npm run images:freeze -- --pool <template>.v<n> --set <set_id> --n <N> [--filter <param>=<value>[,<value>...]]... [--seed <int>] [--large]

Chooses N images of the pool that match the filter, spread over the parameters it leaves free, and
writes images/sets/<set_id>.json. A set holds 12 to 16 images; --large allows more, up to the pool,
for a set that trades a slow start for identity capacity (images.md §1). The selection seed is drawn
and recorded when not given. Refuses to overwrite a set: a set is frozen.`

export const MIN_N = 12
export const MAX_N = 16

export function parseFilter(t: Template, specs: string[]): Record<string, string[]> {
  const filter: Record<string, string[]> = {}
  for (const spec of specs) {
    const m = /^([^=]+)=(.+)$/.exec(spec)
    if (!m) throw new Error(`--filter wants <param>=<value>[,<value>...], not ${spec}`)
    const name = m[1]!
    const values = m[2]!.split(',')
    if (!has(t.parameters, name)) throw new Error(`template ${t.id} v${t.version} has no parameter ${name}`)
    for (const v of values) if (!has(t.parameters[name]!, v)) throw new Error(`parameter ${name} has no value ${v}`)
    if (has(filter, name)) throw new Error(`--filter ${name} given twice`)
    filter[name] = [...new Set(values)]
  }
  return filter
}

export function freezeSet(root: string, pool: string, setId: string, n: number, filterSpecs: string[], large: boolean, seed?: number): SetRecord {
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(setId)) throw new Error(`set_id must be lowercase letters, digits, dots and hyphens: ${setId}`)
  if (!Number.isInteger(n) || n < MIN_N) throw new Error(`N must be an integer of at least ${MIN_N}, not ${n}`)
  if (n > MAX_N && !large) throw new Error(`N = ${n} is over ${MAX_N}; pass --large for a large set (images.md §1)`)
  if (seed !== undefined && !(Number.isSafeInteger(seed) && seed >= 0)) throw new Error(`seed must be a non-negative integer, not ${seed}`)
  const file = join(setsDir(root), `${setId}.json`)
  if (existsSync(file)) throw new Error(`${file} exists; a set is frozen`)
  const t = loadTemplate(root, pool)
  const filter = parseFilter(t, filterSpecs)
  const files = paths(root, pool)
  const images = readJsonl<ImageRecord>(files.images)
  const considered = consider(images, withdrawnImages(images, readJsonl<Decision>(files.curation)), filter)
  const s = seed ?? randomInt(0, 2 ** 32)
  const chosen = selectFrom(t, considered, filter, n, s)
  const record: SetRecord = {
    set_id: setId, template: t.id, version: t.version, filter, n, large, seed: s,
    considered: considered.map(i => i.sha256), images: chosen, published: null,
  }
  mkdirSync(setsDir(root), { recursive: true })
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n')
  return record
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, {
    set: { type: 'string' },
    n: { type: 'string' },
    filter: { type: 'string', multiple: true },
    seed: { type: 'string' },
    large: { type: 'boolean' },
  })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.set || !opts.n) throw new Error(`--set and --n are required\n\n${USAGE}`)
  const seed = opts.seed === undefined ? undefined : Number(opts.seed)
  const record = freezeSet(root, pool, opts.set, Number(opts.n), opts.filter ?? [], opts.large ?? false, seed)
  console.log(`froze ${record.set_id}: ${record.n} of ${record.considered.length} images of ${pool}, filter ${JSON.stringify(record.filter)}, seed ${record.seed}`)
}

if (import.meta.main) run(main)

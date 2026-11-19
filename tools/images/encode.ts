// `encode`: accepted candidates to served images (docs/image-pipeline.md §2.5).
//
// Signing the C2PA manifest is not implemented yet: there is no signing certificate (images.md §9).
// Until it is, `--unsigned` makes prototype images, recorded as unsigned, which no published set may
// hold (images.md §8). Signing one later gives new bytes, so a new image.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { parseCli, requirePool, run } from './lib/cli.ts'
import {
  appendJsonl, candidateKey, extension, isoSeconds, lastDecisions, loadTemplate, paths, readJsonl, servedRegion,
  sha256, subjectNumber,
  type Decision, type Generation, type ImageRecord, type Subject, type Template,
} from './lib/records.ts'

const USAGE = `Usage: npm run images:encode -- --pool <template>.v<n> --unsigned

For each accepted candidate with no image, crops it from its sheet if it came from one (the cell less
the template's inset), converts it to sRGB, scales it to the template's served size and encodes it in
the served format and quality. Writes images/pools/<pool>/served/<sha256>.<ext> and appends the image
record to images.jsonl, one candidate at a time. A candidate it must refuse, such as one whose
original changed, is named at the end; the rest are encoded.

  --unsigned  required for now: signing is not implemented, so images are prototypes that no
              published set may hold`

export const ENCODER = 'sharp'

export function encoderVersion(): string {
  const v = sharp.versions
  return `${v.sharp} libvips ${v.vips} libwebp ${v.webp ?? 'unknown'}`
}

export function originalPath(root: string, pool: string, g: Generation): string {
  const files = paths(root, pool)
  return g.sheet
    ? join(files.sheets, `${g.sheet}.${extension(g.format)}`)
    : join(files.candidates, `${g.subject}-c${g.candidate}.${extension(g.format)}`)
}

/**
 * The served file for one candidate: the step every encode, and the online check, repeats.
 * Decodes at sharp's default level for untrusted input, which refuses a corrupt file.
 */
export async function serve(t: Template, original: Uint8Array, g: Generation): Promise<Buffer> {
  if (t.served.format !== 'webp') throw new Error(`served format ${t.served.format} is not supported; only webp`)
  const meta = await sharp(original).metadata()
  if (meta.orientation !== undefined && meta.orientation !== 1) throw new Error(`EXIF orientation ${meta.orientation}: the original's pixels are stored rotated`)
  let img = sharp(original).pipelineColourspace('srgb')
  if (g.crop) {
    const r = servedRegion(t, g)
    img = img.extract({ left: r.x, top: r.y, width: r.width, height: r.height })
  }
  return img
    .resize(t.served.width, t.served.height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('srgb')
    .webp({ quality: t.served.quality, effort: 4 })
    .toBuffer()
}

/** Accepted candidates with no image yet, in subject order. */
export function pending(generations: Generation[], curation: Decision[], images: ImageRecord[]): Generation[] {
  const last = lastDecisions(curation)
  const done = new Set(images.map(i => candidateKey(i.subject, i.candidate)))
  return generations
    .filter(g => last.get(candidateKey(g.subject, g.candidate))?.decision === 'accept' && !done.has(candidateKey(g.subject, g.candidate)))
    .sort((a, b) => subjectNumber(a.subject) - subjectNumber(b.subject) || a.candidate - b.candidate)
}

export interface EncodeReport {
  records: ImageRecord[]
  refused: Array<{ subject: string; candidate: number; reason: string }>
}

export async function encodePool(root: string, pool: string, log: (line: string) => void = console.log): Promise<EncodeReport> {
  const t = loadTemplate(root, pool)
  const files = paths(root, pool)
  const subjects = new Map(readJsonl<Subject>(files.subjects).map(s => [s.subject, s]))
  const curation = readJsonl<Decision>(files.curation)
  const last = lastDecisions(curation)
  const existing = readJsonl<ImageRecord>(files.images)
  const version = encoderVersion()
  // Every served file in a pool comes from one encoder version (images.md §8).
  const others = [...new Set(existing.map(i => `${i.encoder} ${i.encoder_version}`))].filter(v => v !== `${ENCODER} ${version}`)
  if (others.length) throw new Error(`${pool} was encoded with ${others.join('; ')}, not ${ENCODER} ${version}; one pool keeps one encoder version`)
  const todo = pending(readJsonl<Generation>(files.generations), curation, existing)
  const originals = new Map<string, Buffer>()
  const report: EncodeReport = { records: [], refused: [] }
  mkdirSync(files.served, { recursive: true })
  for (const g of todo) {
    try {
      const path = originalPath(root, pool, g)
      if (!existsSync(path)) throw new Error(`original not found at ${path}`)
      let bytes = originals.get(path)
      if (!bytes) {
        bytes = readFileSync(path)
        originals.set(path, bytes)
      }
      const actual = sha256(bytes)
      if (actual !== g.sha256) {
        throw new Error(`${path} has SHA-256 ${actual}, not the ${g.sha256} generations.jsonl recorded; the file changed after curation, so reject the candidate and the subject reopens`)
      }
      const subject = subjects.get(g.subject)
      if (!subject) throw new Error('in generations.jsonl but not subjects.jsonl')
      const served = await serve(t, bytes, g)
      const meta = await sharp(served).metadata()
      if (meta.format !== t.served.format || meta.width !== t.served.width || meta.height !== t.served.height) {
        throw new Error(`encoder wrote ${meta.format} ${meta.width}x${meta.height}, not the template's ${t.served.format} ${t.served.width}x${t.served.height}`)
      }
      const hash = sha256(served)
      const out = join(files.served, `${hash}.${extension(t.served.format)}`)
      if (!existsSync(out)) writeFileSync(out, served)
      const record: ImageRecord = {
        sha256: hash, original: g.sha256, region: servedRegion(t, g), template: t.id, version: t.version, subject: g.subject, candidate: g.candidate,
        values: subject.values, tags: last.get(candidateKey(g.subject, g.candidate))?.tags ?? {},
        width: t.served.width, height: t.served.height, format: t.served.format, bytes: served.length,
        quality: t.served.quality, encoder: ENCODER, encoder_version: version, signed: false, time: isoSeconds(new Date()),
      }
      // One record per file, as it is written, so a stop midway leaves no file without its record.
      appendJsonl(files.images, [record])
      report.records.push(record)
      log(`${g.subject} c${g.candidate} -> ${hash.slice(0, 12)} (${served.length} bytes)`)
    } catch (e) {
      report.refused.push({ subject: g.subject, candidate: g.candidate, reason: (e as Error).message })
    }
  }
  return report
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, { unsigned: { type: 'boolean' } })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.unsigned) throw new Error(`signing is not implemented yet (image-pipeline.md §2.5); pass --unsigned for prototype images\n\n${USAGE}`)
  const { records, refused } = await encodePool(root, pool)
  console.log(`encoded ${records.length} images in ${pool}, unsigned`)
  if (refused.length) {
    for (const r of refused) console.error(`refused ${r.subject} c${r.candidate}: ${r.reason}`)
    throw new Error(`${refused.length} candidates refused`)
  }
}

if (import.meta.main) run(main)

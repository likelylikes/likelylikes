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
  appendJsonl, candidateKey, extension, isoSeconds, lastDecisions, loadTemplate, paths, readJsonl, sha256,
  subjectNumber,
  type Decision, type Generation, type ImageRecord, type Subject, type Template,
} from './lib/records.ts'

const USAGE = `Usage: npm run images:encode -- --pool <template>.v<n> --unsigned

For each accepted candidate with no image, crops it from its sheet if it came from one, converts it
to sRGB, scales it to the template's served size and encodes it in the served format and quality.
Writes images/pools/<pool>/served/<sha256>.<ext> and appends the image record to images.jsonl.

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

/** The served file for one candidate: the step every encode, and the online check, repeats. */
export async function serve(t: Template, original: Uint8Array, g: Generation): Promise<Buffer> {
  if (t.served.format !== 'webp') throw new Error(`served format ${t.served.format} is not supported; only webp`)
  let img = sharp(original, { failOn: 'error' })
  if (g.crop) img = img.extract({ left: g.crop.x, top: g.crop.y, width: g.crop.width, height: g.crop.height })
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

export async function encodePool(root: string, pool: string, log: (line: string) => void = console.log): Promise<ImageRecord[]> {
  const t = loadTemplate(root, pool)
  const files = paths(root, pool)
  const subjects = new Map(readJsonl<Subject>(files.subjects).map(s => [s.subject, s]))
  const curation = readJsonl<Decision>(files.curation)
  const last = lastDecisions(curation)
  const todo = pending(readJsonl<Generation>(files.generations), curation, readJsonl<ImageRecord>(files.images))
  const version = encoderVersion()
  const originals = new Map<string, Buffer>()
  const records: ImageRecord[] = []
  mkdirSync(files.served, { recursive: true })
  for (const g of todo) {
    const path = originalPath(root, pool, g)
    if (!existsSync(path)) throw new Error(`${g.subject} c${g.candidate}: original not found at ${path}`)
    let bytes = originals.get(path)
    if (!bytes) {
      bytes = readFileSync(path)
      originals.set(path, bytes)
    }
    const actual = sha256(bytes)
    if (actual !== g.sha256) {
      throw new Error(`${g.subject} c${g.candidate}: ${path} has SHA-256 ${actual}, not the ${g.sha256} generations.jsonl recorded; the file changed after curation, so reject the candidate and the subject reopens`)
    }
    const served = await serve(t, bytes, g)
    const meta = await sharp(served).metadata()
    if (meta.format !== t.served.format || meta.width !== t.served.width || meta.height !== t.served.height) {
      throw new Error(`${g.subject}: encoder wrote ${meta.format} ${meta.width}x${meta.height}, not the template's ${t.served.format} ${t.served.width}x${t.served.height}`)
    }
    const hash = sha256(served)
    const out = join(files.served, `${hash}.${extension(t.served.format)}`)
    if (!existsSync(out)) writeFileSync(out, served)
    const subject = subjects.get(g.subject)
    if (!subject) throw new Error(`${g.subject}: in generations.jsonl but not subjects.jsonl`)
    records.push({
      sha256: hash, original: g.sha256, template: t.id, version: t.version, subject: g.subject, candidate: g.candidate,
      values: subject.values, tags: last.get(candidateKey(g.subject, g.candidate))?.tags ?? {},
      width: t.served.width, height: t.served.height, format: t.served.format, bytes: served.length,
      quality: t.served.quality, encoder: ENCODER, encoder_version: version, signed: false, time: isoSeconds(new Date()),
    })
    log(`${g.subject} c${g.candidate} -> ${hash.slice(0, 12)} (${served.length} bytes)`)
  }
  appendJsonl(files.images, records)
  return records
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, { unsigned: { type: 'boolean' } })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.unsigned) throw new Error(`signing is not implemented yet (image-pipeline.md §2.5); pass --unsigned for prototype images\n\n${USAGE}`)
  const records = await encodePool(root, pool)
  console.log(`encoded ${records.length} images in ${pool}, unsigned`)
}

if (import.meta.main) run(main)

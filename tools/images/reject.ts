// `reject`: rejects from the command line, with one of images.md §4's reasons (docs/image-pipeline.md §2.4a).

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCli, requirePool, run } from './lib/cli.ts'
import {
  REJECT_REASONS, appendJsonl, candidateKey, isoSeconds, lastDecisions, loadTemplate, parseSubjects, paths, readJson,
  readJsonl, setsDir,
  type Decision, type Generation, type ImageRecord, type SetRecord, type Subject,
} from './lib/records.ts'

const USAGE = `Usage: npm run images:reject -- --pool <template>.v<n> --subjects s001,s002 [--candidate <k>] --reason <reason> --note "<why>"

Appends a reject of each subject's candidate k (default 1) to curation.jsonl. The reason is one of
${REJECT_REASONS.join(', ')} (images.md §4). Rejecting a candidate that has an image withdraws the
image, so every set holding it must be frozen again; refused for an image in a published set.`

export function rejections(
  ids: string[], candidate: number, reason: string, note: string, time: string,
  generations: Generation[], curation: Decision[], images: ImageRecord[], sets: SetRecord[],
): { decisions: Decision[]; withdrawn: ImageRecord[]; affectedSets: string[] } {
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) throw new Error(`reason must be one of ${REJECT_REASONS.join(', ')}, not ${reason}`)
  const last = lastDecisions(curation)
  const decisions: Decision[] = []
  const withdrawn: ImageRecord[] = []
  for (const subject of ids) {
    if (!generations.some(g => g.subject === subject && g.candidate === candidate)) throw new Error(`${subject} has no candidate ${candidate}`)
    const prior = last.get(candidateKey(subject, candidate))
    if (prior?.decision === 'reject' && prior.reason === reason) continue
    const images_ = images.filter(i => i.subject === subject && i.candidate === candidate)
    for (const img of images_) {
      const published = sets.find(s => s.published !== null && s.images.includes(img.sha256))
      if (published) throw new Error(`${subject} c${candidate}: its image is in published set ${published.set_id}; a published set never changes`)
    }
    withdrawn.push(...images_)
    decisions.push({ subject, candidate, decision: 'reject', reason, note, tags: {}, time })
  }
  const hashes = new Set(withdrawn.map(i => i.sha256))
  const affectedSets = sets.filter(s => s.images.some(h => hashes.has(h))).map(s => s.set_id)
  return { decisions, withdrawn, affectedSets }
}

function loadSets(root: string): SetRecord[] {
  const dir = setsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(n => n.endsWith('.json')).sort().map(n => readJson<SetRecord>(join(dir, n)))
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, {
    subjects: { type: 'string' },
    candidate: { type: 'string' },
    reason: { type: 'string' },
    note: { type: 'string' },
  })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.subjects || !opts.reason) throw new Error(`--subjects and --reason are required\n\n${USAGE}`)
  const note = opts.note?.trim()
  if (!note) throw new Error(`--note is required: say what is wrong\n\n${USAGE}`)
  const candidate = Number(opts.candidate ?? '1')
  if (!Number.isInteger(candidate) || candidate < 1) throw new Error(`--candidate must be a positive integer, not ${opts.candidate}`)
  loadTemplate(root, pool)
  const files = paths(root, pool)
  const subjects = readJsonl<Subject>(files.subjects)
  const { decisions, withdrawn, affectedSets } = rejections(
    parseSubjects(opts.subjects, subjects), candidate, opts.reason, note, isoSeconds(new Date()),
    readJsonl<Generation>(files.generations), readJsonl<Decision>(files.curation), readJsonl<ImageRecord>(files.images), loadSets(root),
  )
  appendJsonl(files.curation, decisions)
  console.log(`rejected ${decisions.length} candidates in ${pool} as ${opts.reason}${decisions.length ? ': ' + decisions.map(d => d.subject).join(' ') : ''}`)
  if (withdrawn.length) console.log(`withdrew ${withdrawn.length} images; freeze again any set that held them: ${affectedSets.join(', ') || 'none'}`)
}

if (import.meta.main) run(main)

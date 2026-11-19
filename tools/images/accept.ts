// `accept`: accepts from the command line, for a prototype pool its owner chose to take before anyone
// curates it (docs/image-pipeline.md §2.4a). The note records who decided and why.

import { parseCli, requirePool, run } from './lib/cli.ts'
import {
  appendJsonl, candidateKey, isoSeconds, lastDecisions, loadTemplate, parseSubjects, paths, readJsonl,
  type Decision, type Generation, type Subject,
} from './lib/records.ts'

const USAGE = `Usage: npm run images:accept -- --pool <template>.v<n> --all --note "<who decided, and why>"
       npm run images:accept -- --pool <template>.v<n> --subjects s001,s002 [--candidate <k>] --note "<…>"

--all appends an accept for every subject nobody has decided on yet, on its first candidate: what
"first that passes" picks when nobody looks. A subject with any decision, such as one held back by a
reject, is left as it is.

--subjects accepts those subjects' candidate k (default 1), overturning an earlier reject of it; it is
refused when a lower-numbered candidate is not rejected or another candidate is accepted.

Curation proper is the curate step. Both forms are refused when the template declares tags, which an
accept must record.`

export function bulkAccepts(subjects: Subject[], generations: Generation[], curation: Decision[], note: string, time: string): Decision[] {
  const last = lastDecisions(curation)
  const out: Decision[] = []
  for (const s of subjects) {
    const candidates = generations.filter(g => g.subject === s.subject).map(g => g.candidate).sort((a, b) => a - b)
    if (candidates.some(c => last.get(candidateKey(s.subject, c)))) continue
    const next = candidates[0]
    if (next === undefined) continue
    out.push({ subject: s.subject, candidate: next, decision: 'accept', reason: '', note, tags: {}, time })
  }
  return out
}

export function namedAccepts(ids: string[], candidate: number, generations: Generation[], curation: Decision[], note: string, time: string): Decision[] {
  const last = lastDecisions(curation)
  const out: Decision[] = []
  for (const subject of ids) {
    const candidates = generations.filter(g => g.subject === subject).map(g => g.candidate).sort((a, b) => a - b)
    if (!candidates.includes(candidate)) throw new Error(`${subject} has no candidate ${candidate}`)
    const lower = candidates.filter(c => c < candidate && last.get(candidateKey(subject, c))?.decision !== 'reject')
    if (lower.length) throw new Error(`${subject}: c${lower[0]} comes first and is not rejected`)
    const other = candidates.find(c => c !== candidate && last.get(candidateKey(subject, c))?.decision === 'accept')
    if (other !== undefined) throw new Error(`${subject}: c${other} is already accepted`)
    if (last.get(candidateKey(subject, candidate))?.decision === 'accept') continue
    out.push({ subject, candidate, decision: 'accept', reason: '', note, tags: {}, time })
  }
  return out
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, {
    all: { type: 'boolean' },
    subjects: { type: 'string' },
    candidate: { type: 'string' },
    note: { type: 'string' },
  })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.all === !opts.subjects) throw new Error(`give either --all or --subjects\n\n${USAGE}`)
  const note = opts.note?.trim()
  if (!note) throw new Error(`--note is required: say who decided, and why\n\n${USAGE}`)
  const t = loadTemplate(root, pool)
  if (Object.keys(t.tags).length) throw new Error(`template ${pool} declares tags (${Object.keys(t.tags).join(', ')}); an accept must record them, so curate one by one`)
  const files = paths(root, pool)
  const subjects = readJsonl<Subject>(files.subjects)
  const generations = readJsonl<Generation>(files.generations)
  const curation = readJsonl<Decision>(files.curation)
  const time = isoSeconds(new Date())
  let accepts: Decision[]
  if (opts.all) {
    accepts = bulkAccepts(subjects, generations, curation, note, time)
  } else {
    const candidate = Number(opts.candidate ?? '1')
    if (!Number.isInteger(candidate) || candidate < 1) throw new Error(`--candidate must be a positive integer, not ${opts.candidate}`)
    accepts = namedAccepts(parseSubjects(opts.subjects!, subjects), candidate, generations, curation, note, time)
  }
  appendJsonl(files.curation, accepts)
  console.log(`accepted ${accepts.length} candidates in ${pool}${accepts.length ? ': ' + accepts.map(a => a.subject).join(' ') : ''}`)
}

if (import.meta.main) run(main)

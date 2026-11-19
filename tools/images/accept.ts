// `accept --all`: accepts every undecided subject at once, for a prototype pool its owner chose to
// take unreviewed (docs/image-pipeline.md §2.4a). The note records who decided and why.

import { parseCli, requirePool, run } from './lib/cli.ts'
import {
  appendJsonl, candidateKey, isoSeconds, lastDecisions, loadTemplate, paths, readJsonl,
  type Decision, type Generation, type Subject,
} from './lib/records.ts'

const USAGE = `Usage: npm run images:accept -- --pool <template>.v<n> --all --note "<who decided, and why>"

Appends an accept to curation.jsonl for every subject that has none yet, on its lowest-numbered
candidate not rejected: what "first that passes" picks when nobody looks. For a prototype pool
taken unreviewed; curation proper is the curate step. Refused when the template declares tags,
which an accept must record and nobody here has looked to fill.`

export function bulkAccepts(subjects: Subject[], generations: Generation[], curation: Decision[], note: string, time: string): Decision[] {
  const last = lastDecisions(curation)
  const out: Decision[] = []
  for (const s of subjects) {
    const candidates = generations.filter(g => g.subject === s.subject).map(g => g.candidate).sort((a, b) => a - b)
    if (candidates.some(c => last.get(candidateKey(s.subject, c))?.decision === 'accept')) continue
    const next = candidates.find(c => last.get(candidateKey(s.subject, c))?.decision !== 'reject')
    if (next === undefined) continue
    out.push({ subject: s.subject, candidate: next, decision: 'accept', reason: '', note, tags: {}, time })
  }
  return out
}

async function main(): Promise<void> {
  const { values: opts, root } = parseCli(USAGE, { all: { type: 'boolean' }, note: { type: 'string' } })
  const pool = requirePool(opts.pool, USAGE)
  if (!opts.all) throw new Error(`only --all is supported; curate one by one with the curate step\n\n${USAGE}`)
  const note = opts.note?.trim()
  if (!note) throw new Error(`--note is required: say who decided to accept unreviewed, and why\n\n${USAGE}`)
  const t = loadTemplate(root, pool)
  if (Object.keys(t.tags).length) throw new Error(`template ${pool} declares tags (${Object.keys(t.tags).join(', ')}); an accept must record them, so accept one by one`)
  const files = paths(root, pool)
  const accepts = bulkAccepts(readJsonl<Subject>(files.subjects), readJsonl<Generation>(files.generations), readJsonl<Decision>(files.curation), note, isoSeconds(new Date()))
  appendJsonl(files.curation, accepts)
  console.log(`accepted ${accepts.length} subjects in ${pool}`)
}

if (import.meta.main) run(main)

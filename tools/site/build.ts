// `build`: the site the Worker serves, in public/. The client (web/) is copied as it is; each frozen
// set's served images go under public/data/img/, with public/data/catalogue.json listing the sets.
// Prototypes serve the served files from the repo (docs/image-pipeline.md §1). Nothing under
// /data/ is reachable by a direct request: the Worker reads it through its ASSETS binding
// (wrangler.jsonc).

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { run } from '../images/lib/cli.ts'
import { REPO, extension, paths, poolName, readJson, setsDir, type SetRecord, type Template } from '../images/lib/records.ts'

export interface CatalogueImage {
  /** The image's sha256: an id the Worker keeps to itself. */
  id: string
  /** Where the build put the file, under /data/. */
  path: string
  type: string
}

export interface CatalogueSet {
  id: string
  question: string
  n: number
  large: boolean
  published: string | null
  /** In the set's order. */
  images: CatalogueImage[]
}

export interface Catalogue {
  sets: CatalogueSet[]
}

/** Empties public/, copies web/ into it, then the sets' images and the catalogue. Fails on any missing file. */
export function build(root: string): Catalogue {
  const out = join(root, 'public')
  const web = join(root, 'web')
  if (!existsSync(web)) throw new Error(`no client to copy: ${web} is missing`)
  rmSync(out, { recursive: true, force: true })
  cpSync(web, out, { recursive: true })
  mkdirSync(join(out, 'data', 'img'), { recursive: true })

  const sets: CatalogueSet[] = []
  for (const file of readdirSync(setsDir(root)).filter(f => f.endsWith('.json')).sort()) {
    const set = readJson<SetRecord>(join(setsDir(root), file))
    const p = paths(root, poolName(set.template, set.version))
    const t = readJson<Template>(p.template)
    const ext = extension(t.served.format)
    const images = set.images.map(sha256 => {
      const from = join(p.served, `${sha256}.${ext}`)
      if (!existsSync(from)) throw new Error(`set ${set.set_id}: served file missing: ${from}`)
      const path = `/data/img/${sha256}.${ext}`
      copyFileSync(from, join(out, path))
      // extension() accepts only jpeg, png and webp, whose media types are image/<format>.
      return { id: sha256, path, type: `image/${t.served.format}` }
    })
    sets.push({ id: set.set_id, question: t.question, n: set.n, large: set.large, published: set.published, images })
  }
  const catalogue = { sets }
  writeFileSync(join(out, 'data', 'catalogue.json'), JSON.stringify(catalogue, null, 2) + '\n')
  return catalogue
}

async function main(): Promise<void> {
  const { sets } = build(REPO)
  const images = sets.reduce((sum, s) => sum + s.images.length, 0)
  console.log(`built public/: web/, ${sets.length} set(s) and ${images} image(s) under public/data/`)
}

if (import.meta.main) run(main)

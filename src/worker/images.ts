// The image source (docs/requirements.md, Image sets and sources): the only code that knows where a
// set's images come from. The rest of the Worker sees sets and opaque image ids, never a path.
// This implementation reads public/data/, which `npm run build` writes (tools/site/build.ts),
// through the ASSETS binding. Images in R2 would be another implementation of the same interface.

/** One frozen set, as the game sees it. */
export interface ImageSet {
  readonly id: string
  readonly question: string
  readonly n: number
  readonly large: boolean
  /** null for a prototype set. */
  readonly published: string | null
  /** The set's image ids, in the set's order. */
  readonly images: readonly string[]
}

export interface ImageFile {
  readonly body: ReadableStream
  readonly type: string
}

export interface ImageSource {
  /** Every set, in catalogue order. */
  sets(): Promise<readonly ImageSet[]>
  /** The set with this id, or null. */
  set(id: string): Promise<ImageSet | null>
  /** One image of a set, or null when the set does not hold it. */
  image(setId: string, imageId: string): Promise<ImageFile | null>
}

/** public/data/catalogue.json, as tools/site/build.ts writes it. */
interface Catalogue {
  sets: Array<Omit<ImageSet, 'images'> & { images: Array<{ id: string; path: string; type: string }> }>
}

interface Loaded {
  sets: ImageSet[]
  files: Map<string, Map<string, { path: string; type: string }>>
}

const CATALOGUE = '/data/catalogue.json'
/** The ASSETS binding looks only at a URL's path; the host is a placeholder. */
const ORIGIN = 'https://assets.invalid'

// Kept for the isolate's lifetime once it has loaded: the catalogue changes only with a new build,
// which is a new deploy. Only the resolved value is cached, never a pending promise shared across
// requests, which would tie one request's I/O to another's.
let loaded: Loaded | undefined

async function load(assets: Fetcher): Promise<Loaded> {
  if (loaded) return loaded
  const res = await assets.fetch(new Request(ORIGIN + CATALOGUE))
  if (!res.ok) throw new Error(`catalogue ${CATALOGUE}: HTTP ${res.status}; has npm run build run?`)
  const catalogue = (await res.json()) as Catalogue
  const result: Loaded = { sets: [], files: new Map() }
  for (const s of catalogue.sets) {
    result.sets.push({ id: s.id, question: s.question, n: s.n, large: s.large, published: s.published, images: s.images.map(i => i.id) })
    result.files.set(s.id, new Map(s.images.map(i => [i.id, { path: i.path, type: i.type }])))
  }
  loaded = result
  return result
}

/** The image source backed by the static assets the build wrote. */
export function assetsImageSource(assets: Fetcher): ImageSource {
  return {
    async sets() {
      return (await load(assets)).sets
    },
    async set(id) {
      return (await load(assets)).sets.find(s => s.id === id) ?? null
    },
    async image(setId, imageId) {
      const file = (await load(assets)).files.get(setId)?.get(imageId)
      if (!file) return null
      const res = await assets.fetch(new Request(ORIGIN + file.path))
      if (!res.ok || !res.body) throw new Error(`image ${file.path}: HTTP ${res.status}`)
      return { body: res.body, type: file.type }
    },
  }
}

// A set's selection (images.md §5), shared by `freeze` and the check so the check can re-run it.
//
// Considered: the first `poolImages` image records of the pool, not withdrawn, that match the filter.
// Shuffle them with random.Random(seed).shuffle, then pick N greedily: each time, the first image in
// shuffled order whose values for the free parameters (those the filter does not fix to one value)
// have been picked least so far, counted as the sum over those parameters. That spreads the set over
// the free parameters' values as evenly as the images allow.

import { PyRandom } from './pyrandom.ts'
import type { ImageRecord, Template } from './records.ts'

export function matchesFilter(values: Record<string, string>, filter: Record<string, string[]>): boolean {
  return Object.entries(filter).every(([name, allowed]) => allowed.includes(values[name] ?? ''))
}

export function freeParameters(t: Template, filter: Record<string, string[]>): string[] {
  return Object.keys(t.parameters).filter(name => (filter[name]?.length ?? 2) > 1)
}

export function selectImages(
  t: Template, images: ImageRecord[], poolImages: number, withdrawn: Set<string>,
  filter: Record<string, string[]>, n: number, seed: number,
): string[] {
  if (poolImages > images.length) throw new Error(`set considers ${poolImages} images but the pool has ${images.length}`)
  const order = images.slice(0, poolImages).filter(i => !withdrawn.has(i.sha256) && matchesFilter(i.values, filter))
  if (order.length < n) throw new Error(`only ${order.length} images match the filter, fewer than N = ${n}`)
  new PyRandom(seed).shuffle(order)
  const free = freeParameters(t, filter)
  const counts = new Map<string, number>()
  const key = (name: string, value: string | undefined) => `${name}=${value}`
  const chosen: string[] = []
  while (chosen.length < n) {
    let best = 0
    let bestScore = Infinity
    order.forEach((img, i) => {
      const score = free.reduce((sum, name) => sum + (counts.get(key(name, img.values[name])) ?? 0), 0)
      if (score < bestScore) {
        best = i
        bestScore = score
      }
    })
    const [img] = order.splice(best, 1)
    chosen.push(img!.sha256)
    for (const name of free) counts.set(key(name, img!.values[name]), (counts.get(key(name, img!.values[name])) ?? 0) + 1)
  }
  return chosen
}

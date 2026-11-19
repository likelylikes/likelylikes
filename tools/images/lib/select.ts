// A set's selection (images.md §5), shared by `freeze` and the check so the check can re-run it.
//
// Considered: the pool's images that match the filter and are not withdrawn, in pool order, as they
// stand when the set is frozen; the set records them, so later withdrawals, new images and a
// reordered log change nothing. Shuffle them with random.Random(seed).shuffle, then pick N
// greedily: each time, the first image in shuffled order whose values for the free parameters
// (those the filter does not fix to one value) have been picked least so far, summed over those
// parameters. With one free parameter that spreads the set as evenly as the images allow; with
// several it can miss an even split when a combination is scarce.

import { PyRandom } from './pyrandom.ts'
import type { ImageRecord, Template } from './records.ts'

export function matchesFilter(values: Record<string, string>, filter: Record<string, string[]>): boolean {
  return Object.entries(filter).every(([name, allowed]) => Object.hasOwn(values, name) && allowed.includes(values[name]!))
}

export function freeParameters(t: Template, filter: Record<string, string[]>): string[] {
  return Object.keys(t.parameters).filter(name => (Object.hasOwn(filter, name) ? filter[name]!.length : 2) > 1)
}

/** The images a set freezes from: matching, not withdrawn, in pool order. */
export function consider(images: ImageRecord[], withdrawn: Set<string>, filter: Record<string, string[]>): ImageRecord[] {
  return images.filter(i => !withdrawn.has(i.sha256) && matchesFilter(i.values, filter))
}

export function selectFrom(t: Template, considered: ImageRecord[], filter: Record<string, string[]>, n: number, seed: number): string[] {
  if (considered.length < n) throw new Error(`only ${considered.length} images match the filter, fewer than N = ${n}`)
  const order = [...considered]
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

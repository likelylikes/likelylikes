// Which four images a round shows, and in what screen order: requirements.md Selection, and
// scoring.md §4.3 and §9 (Display). The quad comes from the server's own randomness; the screen
// order is a fresh uniform shuffle that the scorer never sees.

/** A uniform integer in [0, n). */
export type RandomInt = (n: number) => number

/** Unbiased (rejection sampling) over crypto.getRandomValues. */
export function cryptoRandomInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError(`cryptoRandomInt needs an integer n in [1, 2^32], not ${n}`)
  // Keep a 32-bit word only below the largest multiple of n, so that every residue is equally likely.
  const limit = 2 ** 32 - (2 ** 32 % n)
  const word = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(word)
    const v = word[0]!
    if (v < limit) return v % n
  }
}

export interface QuadSelector {
  readonly id: string
  /** Four distinct images of the set, in no meaningful order. Throws if the set has fewer than 4. */
  select(images: readonly string[], random: RandomInt): string[]
}

/** Uniform random four, requirements.md Selection (MVP). id 'uniform-v1'. */
export const uniformSelector: QuadSelector = {
  id: 'uniform-v1',
  select(images, random) {
    if (images.length < 4) throw new Error(`a quad needs 4 images; the set has ${images.length}`)
    if (new Set(images).size !== images.length) throw new Error('the set lists an image twice')
    // The first four of a uniformly random permutation are a uniformly random four.
    return shuffle(images, random).slice(0, 4)
  },
}

/** A uniformly random permutation (Fisher–Yates), as a new array: the screen order. */
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1)
    if (!Number.isInteger(j) || j < 0 || j > i) throw new RangeError(`random(${i + 1}) gave ${j}`)
    const t = out[i]!
    out[i] = out[j]!
    out[j] = t
  }
  return out
}

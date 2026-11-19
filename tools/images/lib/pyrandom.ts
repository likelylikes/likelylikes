// Python's random.Random, for the parts the pipeline uses: integer seeding, getrandbits(k <= 32),
// _randbelow and shuffle. Every seeded order in the records is defined as the order Python gives,
// `random.Random(seed).shuffle(items)`, so anyone can reproduce it in one line of Python.
// MT19937 as in CPython's Modules/_randommodule.c.

const N = 624
const M = 397

export class PyRandom {
  private readonly mt = new Uint32Array(N)
  private index = N + 1

  constructor(seed: number | bigint) {
    if (typeof seed === 'number' && !Number.isSafeInteger(seed)) throw new Error(`seed must be an integer: ${seed}`)
    // random.seed(int): init_by_array over the 32-bit words of abs(seed), least significant first.
    let n = BigInt(seed)
    if (n < 0n) n = -n
    const key: number[] = []
    do {
      key.push(Number(n & 0xffffffffn))
      n >>= 32n
    } while (n > 0n)
    this.initByArray(key)
  }

  private initGenrand(s: number): void {
    const mt = this.mt
    mt[0] = s >>> 0
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]!
      mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0
    }
    this.index = N
  }

  private initByArray(key: number[]): void {
    this.initGenrand(19650218)
    const mt = this.mt
    let i = 1
    let j = 0
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1]!
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j]! + j) >>> 0
      i++
      j++
      if (i >= N) {
        mt[0] = mt[N - 1]!
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1]!
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        mt[0] = mt[N - 1]!
        i = 1
      }
    }
    mt[0] = 0x80000000
  }

  /** genrand_uint32 */
  private next(): number {
    const mt = this.mt
    if (this.index >= N) {
      let kk = 0
      for (; kk < N - M; kk++) {
        const y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff)
        mt[kk] = mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff)
        mt[kk] = mt[kk + M - N]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)
      }
      const y = (mt[N - 1]! & 0x80000000) | (mt[0]! & 0x7fffffff)
      mt[N - 1] = mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)
      this.index = 0
    }
    let y = mt[this.index++]!
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** random.getrandbits(k) for 1 <= k <= 32. */
  getrandbits(k: number): number {
    if (!Number.isInteger(k) || k < 1 || k > 32) throw new Error(`getrandbits supports 1..32 bits, not ${k}`)
    return this.next() >>> (32 - k)
  }

  /** random._randbelow(n): uniform in [0, n), by rejection on n.bit_length() bits. */
  randbelow(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 0xffffffff) throw new Error(`randbelow supports 1..2^32-1, not ${n}`)
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  /** random.shuffle(x), in place. */
  shuffle<T>(x: T[]): T[] {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1)
      const t = x[i]!
      x[i] = x[j]!
      x[j] = t
    }
    return x
  }
}

// Verifies that a sheet's cells sit on its grid (image-pipeline.md §2.3a).
//
// At each internal grid line, take the mean absolute brightness step between neighbouring pixel
// columns (or rows) at offsets -8..8 from the line. Cells are separate pictures, so the step across
// the line is the largest, and well above the steps inside a picture. A grid off by a pixel peaks
// at another offset; an image with no grid shows no peak at all.
//
// The line for boundary k of n cells over `size` pixels is at round(k * size / n). When that is not
// a whole number, the model may have put the seam on the pixel either side of it, so both count.

import sharp from 'sharp'

export const WINDOW = 8
/** The step across the line must be the largest in the window and this many times the median elsewhere. */
export const MIN_RATIO = 2

export interface Seam {
  axis: 'x' | 'y'
  at: number
  allowed: number[]
  step: number
  maxOther: number
  medianOther: number
  peakOffset: number
  ok: boolean
}

export interface GridReport {
  width: number
  height: number
  /** The side of the square cell every crop takes: the floor of the cell size. */
  cell: number
  exact: boolean
  seams: Seam[]
  ok: boolean
}

export async function verifyGrid(bytes: Uint8Array, rows: number, columns: number): Promise<GridReport> {
  const { data, info } = await sharp(bytes).flatten().greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error(`expected one channel after greyscale, got ${info.channels}`)
  const { width, height } = info
  if (width * rows !== height * columns) {
    throw new Error(`a ${width}x${height} sheet does not hold ${rows}x${columns} square cells (cells would be ${(width / columns).toFixed(1)}x${(height / rows).toFixed(1)})`)
  }
  if (width / columns < 2 * WINDOW + 2) throw new Error(`cells of ${(width / columns).toFixed(1)} px are too small to check`)
  const px = (x: number, y: number) => data[y * width + x]!
  const seams: Seam[] = []
  for (let k = 1; k < columns; k++) seams.push(seam('x', (k * width) / columns, height, (o, i) => Math.abs(px(o, i) - px(o - 1, i))))
  for (let k = 1; k < rows; k++) seams.push(seam('y', (k * height) / rows, width, (o, i) => Math.abs(px(i, o) - px(i, o - 1))))
  return { width, height, cell: Math.floor(width / columns), exact: width % columns === 0 && height % rows === 0, seams, ok: seams.every(s => s.ok) }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function seam(axis: 'x' | 'y', exact: number, length: number, step: (pos: number, along: number) => number): Seam {
  const at = Math.round(exact)
  const allowed = Number.isInteger(exact) ? [0] : [0, exact > at ? 1 : -1]
  const means = new Map<number, number>()
  for (let o = -WINDOW; o <= WINDOW; o++) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += step(at + o, i)
    means.set(o, sum / length)
  }
  const s0 = Math.max(...allowed.map(o => means.get(o)!))
  const others = [...means].filter(([o]) => !allowed.includes(o)).map(([, m]) => m)
  const maxOther = Math.max(...others)
  const medianOther = median(others)
  let peakOffset = 0
  for (const [o, m] of means) if (m > means.get(peakOffset)!) peakOffset = o
  return { axis, at, allowed, step: s0, maxOther, medianOther, peakOffset, ok: s0 > maxOther && s0 >= MIN_RATIO * medianOther }
}

export function describeSeam(s: Seam): string {
  return `${s.axis}=${s.at}: step ${s.step.toFixed(2)}, largest elsewhere ${s.maxOther.toFixed(2)}, median elsewhere ${s.medianOther.toFixed(2)}, peak at offset ${s.peakOffset}`
}

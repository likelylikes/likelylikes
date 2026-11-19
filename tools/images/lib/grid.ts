// Verifies that a sheet's cells sit exactly on its grid (image-pipeline.md §2.3a).
//
// At each internal grid line, take the mean absolute brightness step between neighbouring pixel
// columns (or rows) at offsets -8..8 from the line. Cells are separate pictures, so the step at
// offset 0, across the line, is the largest, and well above the steps inside a picture. A grid off
// by a pixel peaks at another offset; an image with no grid shows no peak at all.

import sharp from 'sharp'

export const WINDOW = 8
/** The step across the line must be the largest in the window and this many times their median. */
export const MIN_RATIO = 2

export interface Seam {
  axis: 'x' | 'y'
  at: number
  step: number
  maxOther: number
  medianOther: number
  peakOffset: number
  ok: boolean
}

export interface GridReport {
  width: number
  height: number
  cell: number
  seams: Seam[]
  ok: boolean
}

export async function verifyGrid(bytes: Uint8Array, rows: number, columns: number): Promise<GridReport> {
  const { data, info } = await sharp(bytes).flatten().greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error(`expected one channel after greyscale, got ${info.channels}`)
  const { width, height } = info
  if (width !== height) throw new Error(`sheet is ${width}x${height}, not square`)
  if (width % columns || height % rows) throw new Error(`sheet ${width}x${height} does not divide into ${rows}x${columns} cells`)
  const cell = width / columns
  if (height / rows !== cell) throw new Error(`cells are not square: ${width / columns}x${height / rows}`)
  const px = (x: number, y: number) => data[y * width + x]!
  const seams: Seam[] = []
  for (let k = 1; k < columns; k++) seams.push(seam('x', k * cell, height, (o, i) => Math.abs(px(o, i) - px(o - 1, i))))
  for (let k = 1; k < rows; k++) seams.push(seam('y', k * cell, width, (o, i) => Math.abs(px(i, o) - px(i, o - 1))))
  return { width, height, cell, seams, ok: seams.every(s => s.ok) }
}

function seam(axis: 'x' | 'y', at: number, length: number, step: (pos: number, along: number) => number): Seam {
  const means: number[] = []
  for (let o = -WINDOW; o <= WINDOW; o++) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += step(at + o, i)
    means.push(sum / length)
  }
  const s0 = means[WINDOW]!
  const others = means.filter((_, i) => i !== WINDOW)
  const maxOther = Math.max(...others)
  const sorted = [...others].sort((a, b) => a - b)
  const medianOther = (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
  const peakOffset = means.indexOf(Math.max(...means)) - WINDOW
  return { axis, at, step: s0, maxOther, medianOther, peakOffset, ok: s0 > maxOther && s0 >= MIN_RATIO * medianOther }
}

export function describeSeam(s: Seam): string {
  return `${s.axis}=${s.at}: step ${s.step.toFixed(2)}, largest elsewhere ${s.maxOther.toFixed(2)}, median elsewhere ${s.medianOther.toFixed(2)}, peak at offset ${s.peakOffset}`
}

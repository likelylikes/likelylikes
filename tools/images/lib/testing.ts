// Fixtures for the image tools' tests.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { PyRandom } from './pyrandom.ts'
import type { Design, Template } from './records.ts'

export interface SheetSpec {
  width: number
  height: number
  rows: number
  columns: number
  seed?: number
  /** px of white along every cell edge, standing in for colour that bleeds across seams */
  border?: number
  /** px the whole grid is shifted right, to make a sheet that is off its grid */
  shift?: number
}

/**
 * A PNG sheet: low noise around a different grey level per cell (at most 229), cells bounded by
 * the grid lines at round(k * size / count), as a grid that does not divide its sheet puts them.
 */
export async function syntheticSheet(spec: SheetSpec): Promise<Buffer> {
  const { width, height, rows, columns, seed = 99, border = 0, shift = 0 } = spec
  const r = new PyRandom(seed)
  const levels = Array.from({ length: rows * columns }, (_, i) => 30 + ((i * 53 + seed) % 190))
  const xs = Array.from({ length: columns + 1 }, (_, k) => Math.round((k * width) / columns) + (k > 0 && k < columns ? shift : 0))
  const ys = Array.from({ length: rows + 1 }, (_, k) => Math.round((k * height) / rows))
  const index = (lines: number[], p: number) => Math.max(0, lines.findLastIndex((l, k) => k < lines.length - 1 && l <= p))
  const data = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    const cy = index(ys, y)
    for (let x = 0; x < width; x++) {
      const cx = index(xs, x)
      const edge = Math.min(x - xs[cx]!, xs[cx + 1]! - 1 - x, y - ys[cy]!, ys[cy + 1]! - 1 - y) < border
      const level = edge ? 255 : levels[cy * columns + cx]! + r.randbelow(21) - 10
      data.fill(level, (y * width + x) * 3, (y * width + x) * 3 + 3)
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

export const TEST_POOL = 'test-sheets.v1'

export const testTemplate: Template = {
  id: 'test-sheets', version: 1, question: 'Which do you like?',
  prompt: 'Sixteen {colour} squares of {age}-year-old grey, in a 4x4 grid.',
  parameters: { colour: { red: 'red', blue: 'blue' }, age: { '30': '30' } },
  exclusions: [], tags: {}, sheet: { rows: 4, columns: 4, inset: 4 },
  model: { provider: 'manual', service: 'Test Studio', id: 'test-model', version: null },
  settings: { aspect_ratio: '1:1' },
  served: { width: 48, height: 48, format: 'webp', quality: 80 },
}

export const testDesign: Design = { template: 'test-sheets', version: 1, stratify: 'colour', per_value: { red: 16, blue: 16 }, balance: [], seed: 12345 }

/** A scratch repository root with the test template and design, and an inbox of two sheets with their prompts. */
export async function scratchRepo(template: Template = testTemplate, design: Design = testDesign): Promise<{ root: string; inbox: string[] }> {
  const root = mkdtempSync(join(tmpdir(), 'likelylikes-images-'))
  const pool = `${template.id}.v${template.version}`
  mkdirSync(join(root, 'images', 'templates'), { recursive: true })
  mkdirSync(join(root, 'images', 'pools', pool), { recursive: true })
  writeFileSync(join(root, 'images', 'templates', `${pool}.json`), JSON.stringify(template, null, 2) + '\n')
  writeFileSync(join(root, 'images', 'pools', pool, 'design.json'), JSON.stringify(design, null, 2) + '\n')
  const inbox = join(root, 'inbox')
  mkdirSync(inbox)
  const files: string[] = []
  for (const [i, colour] of ['red', 'blue'].entries()) {
    const file = join(inbox, `${colour}-squares.png`)
    writeFileSync(file, await syntheticSheet({ width: 256, height: 256, rows: 4, columns: 4, seed: 100 + i }))
    writeFileSync(join(inbox, `${colour}-squares.md`), `Sixteen ${colour} squares of 30-year-old grey,\nin a 4x4 grid.\n`)
    files.push(file)
  }
  return { root, inbox: files }
}

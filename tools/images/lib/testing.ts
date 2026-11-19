// Fixtures for the image tools' tests.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { PyRandom } from './pyrandom.ts'
import type { Design, Template } from './records.ts'

/** A sheet of rows x columns cells: low noise around a different grey level per cell. */
export async function syntheticSheet(rows: number, columns: number, cell: number, seed = 99): Promise<Buffer> {
  const r = new PyRandom(seed)
  const levels = Array.from({ length: rows * columns }, (_, i) => 30 + ((i * 53 + seed) % 190))
  const width = columns * cell
  const height = rows * cell
  const data = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = levels[Math.floor(y / cell) * columns + Math.floor(x / cell)]! + r.randbelow(21) - 10
      data.fill(level, (y * width + x) * 3, (y * width + x) * 3 + 3)
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
}

export const TEST_POOL = 'test-sheets.v1'

export const testTemplate: Template = {
  id: 'test-sheets', version: 1, question: 'Which do you like?',
  prompt: 'Sixteen {colour} squares of {age}-year-old grey, in a 4x4 grid.',
  parameters: { colour: { red: 'red', blue: 'blue' }, age: { '30': '30' } },
  exclusions: [], tags: {}, sheet: { rows: 4, columns: 4 },
  model: { provider: 'manual', service: 'Test Studio', id: 'test-model', version: null },
  settings: { aspect_ratio: '1:1' },
  served: { width: 64, height: 64, format: 'webp', quality: 80 },
}

export const testDesign: Design = { template: 'test-sheets', version: 1, stratify: 'colour', per_value: { red: 16, blue: 16 }, balance: [], seed: 12345 }

/** A scratch repository root with the test template and design, and an inbox of two sheets with their prompts. */
export async function scratchRepo(): Promise<{ root: string; inbox: string[] }> {
  const root = mkdtempSync(join(tmpdir(), 'likelylikes-images-'))
  mkdirSync(join(root, 'images', 'templates'), { recursive: true })
  mkdirSync(join(root, 'images', 'pools', TEST_POOL), { recursive: true })
  writeFileSync(join(root, 'images', 'templates', `${TEST_POOL}.json`), JSON.stringify(testTemplate, null, 2) + '\n')
  writeFileSync(join(root, 'images', 'pools', TEST_POOL, 'design.json'), JSON.stringify(testDesign, null, 2) + '\n')
  const inbox = join(root, 'inbox')
  mkdirSync(inbox)
  const files: string[] = []
  for (const [i, colour] of ['red', 'blue'].entries()) {
    const file = join(inbox, `${colour}-squares.jpg`)
    writeFileSync(file, await syntheticSheet(4, 4, 64, 100 + i))
    writeFileSync(join(inbox, `${colour}-squares.md`), `Sixteen ${colour} squares of 30-year-old grey,\nin a 4x4 grid.\n`)
    files.push(file)
  }
  return { root, inbox: files }
}

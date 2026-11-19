import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { serve } from './encode.ts'
import type { Generation } from './lib/records.ts'
import { syntheticSheet, testTemplate } from './lib/testing.ts'

const cell = (row: number, column: number, size = 256): Generation => ({
  subject: 's001', candidate: 1, sheet: 'g01', sha256: '', crop: { x: (column - 1) * (size / 4), y: (row - 1) * (size / 4), width: size / 4, height: size / 4 },
  width: size, height: size, format: 'png', provider: 'manual', model: 'test-model', settings: {}, time: '',
})

/** The brightest value in the outermost pixel ring of a served image. */
async function brightestEdge(served: Buffer): Promise<number> {
  const { data, info } = await sharp(served).greyscale().raw().toBuffer({ resolveWithObject: true })
  let max = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) max = Math.max(max, data[y * info.width + x]!)
    }
  }
  return max
}

test('the inset trims colour that bleeds across the grid lines', async () => {
  const sheet = await syntheticSheet({ width: 256, height: 256, rows: 4, columns: 4, seed: 7, border: 2 })
  const trimmed = await serve(testTemplate, sheet, cell(2, 3))
  const meta = await sharp(trimmed).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 48, 48])
  assert.ok(await brightestEdge(trimmed) < 245, 'no white from the 2 px border reaches the served edge')
  const untrimmed = await serve({ ...testTemplate, sheet: { rows: 4, columns: 4 } }, sheet, cell(2, 3))
  assert.ok(await brightestEdge(untrimmed) >= 245, 'without the inset the border shows')
})

test('encoding is deterministic', async () => {
  const sheet = await syntheticSheet({ width: 256, height: 256, rows: 4, columns: 4, seed: 7 })
  const a = await serve(testTemplate, sheet, cell(1, 1))
  const b = await serve(testTemplate, sheet, cell(1, 1))
  assert.ok(a.equals(b))
})

test('a 16-bit wide-gamut original is served in sRGB', async () => {
  const size = 256
  const srgb = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) srgb.set([200, 60, 40], i * 3)
  const p3 = await sharp(srgb, { raw: { width: size, height: size, channels: 3 } }).toColourspace('rgb16').withIccProfile('p3').png().toBuffer()
  assert.equal((await sharp(p3).metadata()).depth, 'ushort')
  const served = await serve({ ...testTemplate, sheet: { rows: 4, columns: 4 } }, p3, cell(2, 2, size))
  const { data } = await sharp(served).raw().toBuffer({ resolveWithObject: true })
  const [r, g, b] = [data[0]!, data[1]!, data[2]!]
  assert.ok(Math.abs(r - 200) <= 4 && Math.abs(g - 60) <= 4 && Math.abs(b - 40) <= 4, `served ${r},${g},${b}, want about 200,60,40`)
})

test('a corrupt original is refused, not encoded', async () => {
  // A whole-image candidate, so decoding reaches the damage; a sheet is protected by its hash first.
  // A stray end-of-image marker mid-scan is a libjpeg warning: sharp's laxer 'error' level decodes
  // past it to a mostly grey image; the default level, used for untrusted input, refuses.
  const jpeg = await sharp(await syntheticSheet({ width: 256, height: 256, rows: 1, columns: 1, seed: 9 })).jpeg().toBuffer()
  const broken = Buffer.from(jpeg)
  broken.set([0xff, 0xd9, 0xff, 0xd9, 0xff, 0xd9], Math.floor(broken.length / 2))
  assert.ok(await sharp(broken, { failOn: 'error' }).raw().toBuffer(), 'the laxer level would have encoded it')
  const whole: Generation = { ...cell(1, 1), crop: undefined, sheet: undefined, format: 'jpeg' }
  await assert.rejects(serve(testTemplate, broken, whole), /premature end of data segment/)
})

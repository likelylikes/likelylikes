import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { verifyGrid } from './grid.ts'
import { PyRandom } from './pyrandom.ts'

/** A greyscale PNG of rows x columns cells of `cell` px: low noise around a different level per cell. */
async function sheet(rows: number, columns: number, cell: number, shift = 0): Promise<Buffer> {
  const r = new PyRandom(99)
  const levels = Array.from({ length: rows * columns }, (_, i) => 30 + ((i * 53) % 190))
  const width = columns * cell
  const height = rows * cell
  const data = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(columns - 1, Math.max(0, Math.floor((x - shift) / cell)))
      const cy = Math.floor(y / cell)
      data[y * width + x] = levels[cy * columns + cx]! + r.randbelow(21) - 10
    }
  }
  return sharp(data, { raw: { width, height, channels: 1 } }).png().toBuffer()
}

async function noise(size: number): Promise<Buffer> {
  const r = new PyRandom(5)
  const data = Buffer.alloc(size * size)
  for (let i = 0; i < data.length; i++) data[i] = 100 + r.randbelow(41)
  return sharp(data, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer()
}

test('cells on the grid lines pass', async () => {
  const report = await verifyGrid(await sheet(4, 4, 96), 4, 4)
  assert.equal(report.cell, 96)
  assert.equal(report.seams.length, 6)
  assert.ok(report.ok, JSON.stringify(report.seams))
  assert.ok(report.seams.every(s => s.peakOffset === 0))
})

test('a grid one pixel off fails, and says where the seam is', async () => {
  const report = await verifyGrid(await sheet(4, 4, 96, 1), 4, 4)
  assert.equal(report.ok, false)
  assert.ok(report.seams.filter(s => s.axis === 'x').every(s => !s.ok && s.peakOffset === 1))
})

test('an image with no grid fails', async () => {
  const report = await verifyGrid(await noise(384), 4, 4)
  assert.equal(report.ok, false)
})

test('a sheet that is not square or does not divide is refused', async () => {
  const wide = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#777' } }).png().toBuffer()
  await assert.rejects(verifyGrid(wide, 4, 4), /not square/)
  const odd = await sharp({ create: { width: 390, height: 390, channels: 3, background: '#777' } }).png().toBuffer()
  await assert.rejects(verifyGrid(odd, 4, 4), /does not divide/)
})

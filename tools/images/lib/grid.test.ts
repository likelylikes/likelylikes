import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { verifyGrid } from './grid.ts'
import { PyRandom } from './pyrandom.ts'
import { syntheticSheet } from './testing.ts'

async function noise(size: number): Promise<Buffer> {
  const r = new PyRandom(5)
  const data = Buffer.alloc(size * size)
  for (let i = 0; i < data.length; i++) data[i] = 100 + r.randbelow(41)
  return sharp(data, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer()
}

test('cells on the grid lines pass', async () => {
  const report = await verifyGrid(await syntheticSheet({ width: 384, height: 384, rows: 4, columns: 4 }), 4, 4)
  assert.equal(report.cell, 96)
  assert.equal(report.exact, true)
  assert.equal(report.seams.length, 6)
  assert.ok(report.ok, JSON.stringify(report.seams))
  assert.ok(report.seams.every(s => s.peakOffset === 0))
})

test('a grid one pixel off fails, and says where the seam is', async () => {
  const report = await verifyGrid(await syntheticSheet({ width: 384, height: 384, rows: 4, columns: 4, shift: 1 }), 4, 4)
  assert.equal(report.ok, false)
  assert.ok(report.seams.filter(s => s.axis === 'x').every(s => !s.ok && s.peakOffset === 1))
})

test('a grid that does not divide its sheet passes, with lines at round(k * size / n)', async () => {
  for (const n of [3, 5]) {
    const report = await verifyGrid(await syntheticSheet({ width: 403, height: 403, rows: n, columns: n }), n, n)
    assert.equal(report.exact, false)
    assert.equal(report.cell, Math.floor(403 / n))
    assert.ok(report.ok, `${n}x${n}: ${JSON.stringify(report.seams)}`)
  }
})

test('a sheet need not be square if its cells are', async () => {
  const report = await verifyGrid(await syntheticSheet({ width: 300, height: 200, rows: 2, columns: 3 }), 2, 3)
  assert.ok(report.ok)
  assert.equal(report.cell, 100)
})

test('an image with no grid fails', async () => {
  const report = await verifyGrid(await noise(384), 4, 4)
  assert.equal(report.ok, false)
})

test('a sheet whose cells would not be square is refused', async () => {
  const wide = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#777' } }).png().toBuffer()
  await assert.rejects(verifyGrid(wide, 4, 4), /square cells/)
})

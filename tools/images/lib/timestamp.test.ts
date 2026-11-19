import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO } from './records.ts'
import { c2paTimestamp, generalizedToIso, jpegJumbf } from './timestamp.ts'

const SHEETS = join(REPO, 'images', 'pools', 'women-profiles.v1', 'sheets')

function der(tag: number, content: Buffer): Buffer {
  const n = content.length
  const len = n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff])
  return Buffer.concat([Buffer.from([tag]), len, content])
}

/** encapContentInfo with a TSTInfo whose genTime is `time`. */
function token(time: string): Buffer {
  const tstInfo = der(0x30, Buffer.concat([
    der(0x02, Buffer.from([1])),
    der(0x06, Buffer.from([0x2a, 0x03, 0x04])),
    der(0x30, Buffer.concat([der(0x30, der(0x06, Buffer.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]))), der(0x04, Buffer.alloc(32, 0x18))])),
    der(0x02, Buffer.from([0x18, 0x18])),
    der(0x18, Buffer.from(time, 'ascii')),
  ]))
  return Buffer.concat([Buffer.from('060b2a864886f70d0109100104', 'hex'), der(0xa0, der(0x04, tstInfo))])
}

/** The APP11 segments of a JPEG: offset, length and payload. */
function app11(jpeg: Buffer): Array<{ at: number; end: number; payload: Buffer }> {
  const out = []
  let pos = 2
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff && jpeg[pos + 1] !== 0xda) {
    const len = jpeg.readUInt16BE(pos + 2)
    if (jpeg[pos + 1] === 0xeb) out.push({ at: pos, end: pos + 2 + len, payload: jpeg.subarray(pos + 4, pos + 2 + len) })
    pos += 2 + len
  }
  return out
}

test('reads the C2PA time-stamp of each sheet', () => {
  assert.equal(c2paTimestamp(readFileSync(join(SHEETS, 'g01.jpg'))), '2026-11-02T07:21:09+00:00')
  assert.equal(c2paTimestamp(readFileSync(join(SHEETS, 'g02.jpg'))), '2026-11-02T07:31:34+00:00')
  assert.equal(c2paTimestamp(readFileSync(join(SHEETS, 'g03.jpg'))), '2026-11-02T07:33:26+00:00')
})

test('finds a time-stamp whose token an APP11 segment boundary cuts in two', () => {
  const jpeg = readFileSync(join(SHEETS, 'g01.jpg'))
  const [seg] = app11(jpeg)
  assert.ok(seg)
  const payload = seg.payload
  const header = payload.subarray(0, 8) // CI 'JP', En, Z
  const body = payload.subarray(8) // the JUMBF superbox: LBox, TBox, contents
  const oid = body.indexOf(Buffer.from('060b2a864886f70d0109100104', 'hex'), 0)
  // Several id-ct-TSTInfo occur; cut inside the one that parses, near the start of its token.
  const cuts = [] as number[]
  for (let at = oid; at !== -1; at = body.indexOf(Buffer.from('060b2a864886f70d0109100104', 'hex'), at + 1)) cuts.push(at + 40)
  for (const cut of cuts) {
    const first = Buffer.concat([header, body.subarray(0, cut)])
    const z = Buffer.alloc(4)
    z.writeUInt32BE(header.readUInt32BE(4) + 1)
    const second = Buffer.concat([header.subarray(0, 4), z, body.subarray(0, 8), body.subarray(cut)])
    const segment = (p: Buffer) => Buffer.concat([Buffer.from([0xff, 0xeb]), Buffer.from([(p.length + 2) >> 8, (p.length + 2) & 0xff]), p])
    const split = Buffer.concat([jpeg.subarray(0, seg.at), segment(first), segment(second), jpeg.subarray(seg.end)])
    assert.equal(jpegJumbf(split).length, 1)
    assert.ok(jpegJumbf(split)[0]!.equals(body), 'the joined payload is the original superbox')
    assert.equal(c2paTimestamp(split), '2026-11-02T07:21:09+00:00', `cut at ${cut}`)
  }
})

test('takes the latest of several time-stamps, to the second, skipping broken and impossible ones', () => {
  const broken = Buffer.from('060b2a864886f70d0109100104a0ff', 'hex')
  const bytes = Buffer.concat([
    Buffer.from('junk'), token('20260101120000Z'), broken, token('20260301080910.5Z'), token('20260201000000Z'),
    token('20261399000000Z'), token('20260230000000Z'),
  ])
  assert.equal(c2paTimestamp(bytes), '2026-03-01T08:09:10+00:00')
})

test('a genTime with a byte outside ASCII is not read as a time', () => {
  // 0xb2 is '2' with the high bit set; an ascii decoder would read 2026-12-31.
  const crafted = token('20261231000000Z')
  const at = crafted.lastIndexOf(Buffer.from('20261231'))
  crafted[at + 3] = 0xb6
  const bytes = Buffer.concat([token('20261102072109Z'), crafted])
  assert.equal(c2paTimestamp(bytes), '2026-11-02T07:21:09+00:00')
})

test('a file with no time-stamp gives null', () => {
  assert.equal(c2paTimestamp(Buffer.from('no manifest here, 20261102072109Z')), null)
})

test('GeneralizedTime converts to the records\' time format', () => {
  assert.equal(generalizedToIso('20261102072109Z'), '2026-11-02T07:21:09+00:00')
  assert.throws(() => generalizedToIso('20261102072109+0100'))
  assert.throws(() => generalizedToIso('20261102250000Z'), /calendar/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO } from './records.ts'
import { c2paTimestamp, generalizedToIso } from './timestamp.ts'

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

test('reads the C2PA time-stamp of each sheet', () => {
  const sheets = join(REPO, 'images', 'pools', 'women-profiles.v1', 'sheets')
  assert.equal(c2paTimestamp(readFileSync(join(sheets, 'g01.jpg'))), '2026-11-02T07:21:09+00:00')
  assert.equal(c2paTimestamp(readFileSync(join(sheets, 'g02.jpg'))), '2026-11-02T07:31:34+00:00')
  assert.equal(c2paTimestamp(readFileSync(join(sheets, 'g03.jpg'))), '2026-11-02T07:33:26+00:00')
})

test('takes the latest of several time-stamps, skipping a broken one', () => {
  const broken = Buffer.from('060b2a864886f70d0109100104a0ff', 'hex')
  const bytes = Buffer.concat([Buffer.from('junk'), token('20260101120000Z'), broken, token('20260301080910.5Z'), token('20260201000000Z')])
  assert.equal(c2paTimestamp(bytes), '2026-03-01T08:09:10.5+00:00')
})

test('a file with no time-stamp gives null', () => {
  assert.equal(c2paTimestamp(Buffer.from('no manifest here, 20261102072109Z')), null)
})

test('GeneralizedTime converts to the records\' time format', () => {
  assert.equal(generalizedToIso('20261102072109Z'), '2026-11-02T07:21:09+00:00')
  assert.throws(() => generalizedToIso('20261102072109+0100'))
})

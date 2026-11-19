// Reads the RFC 3161 time-stamp a C2PA manifest carries, as the time a downloaded file was made.
//
// A C2PA claim signature carries a time-stamp token: CMS SignedData whose content is a TSTInfo,
// identified by the OID id-ct-TSTInfo. TSTInfo's fifth field is genTime, a GeneralizedTime. This
// finds each id-ct-TSTInfo and parses the DER that follows; it does not validate the manifest or
// the token's signature. Certificates carry dates too, which is why it does not just look for
// date-shaped strings.
//
// In a JPEG, the manifest store is split across APP11 segments of at most 64 KB, each with its own
// header, which could cut a token in two; the segments are joined before searching. PNG and WebP
// keep the store in one chunk.

// 06 0B 2A 86 48 86 F7 0D 01 09 10 01 04: OBJECT IDENTIFIER 1.2.840.113549.1.9.16.1.4
const TST_INFO_OID = Buffer.from('060b2a864886f70d0109100104', 'hex')

interface Tlv {
  tag: number
  start: number
  end: number
}

function readTlv(buf: Uint8Array, pos: number, limit: number): Tlv {
  if (pos + 2 > limit) throw new Error('truncated DER')
  const tag = buf[pos]!
  let len = buf[pos + 1]!
  let start = pos + 2
  if (len & 0x80) {
    const n = len & 0x7f
    if (n === 0 || n > 4) throw new Error('unsupported DER length')
    if (start + n > limit) throw new Error('truncated DER length')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i]!
    start += n
  }
  const end = start + len
  if (end > limit) throw new Error('DER value overruns its container')
  return { tag, start, end }
}

function genTimeAfter(buf: Uint8Array, oidEnd: number): string {
  // encapContentInfo: eContentType OID, then [0] EXPLICIT OCTET STRING holding the TSTInfo.
  const explicit = readTlv(buf, oidEnd, buf.length)
  if (explicit.tag !== 0xa0) throw new Error('no [0] after id-ct-TSTInfo')
  const octets = readTlv(buf, explicit.start, explicit.end)
  if (octets.tag !== 0x04) throw new Error('no OCTET STRING in eContent')
  const tstInfo = readTlv(buf, octets.start, octets.end)
  if (tstInfo.tag !== 0x30) throw new Error('TSTInfo is not a SEQUENCE')
  // version INTEGER, policy OID, messageImprint SEQUENCE, serialNumber INTEGER, genTime GeneralizedTime
  const expected = [0x02, 0x06, 0x30, 0x02, 0x18]
  let pos = tstInfo.start
  for (let i = 0; i < expected.length; i++) {
    const field = readTlv(buf, pos, tstInfo.end)
    if (field.tag !== expected[i]) throw new Error(`TSTInfo field ${i + 1} has tag ${field.tag}`)
    if (i === 4) return Buffer.from(buf.subarray(field.start, field.end)).toString('ascii')
    pos = field.end
  }
  throw new Error('unreachable')
}

/**
 * GeneralizedTime YYYYMMDDHHMMSS[.f]Z as the records write time, to the second:
 * 2026-11-02T07:21:09+00:00. Refuses a date that is not on the calendar.
 */
export function generalizedToIso(t: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(t)
  if (!m) throw new Error(`not a UTC GeneralizedTime: ${t}`)
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || date.getUTCHours() !== h || date.getUTCMinutes() !== mi || date.getUTCSeconds() !== s) {
    throw new Error(`not a calendar time: ${t}`)
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00`
}

/** The JUMBF payloads of a JPEG's APP11 segments, joined per box instance; empty for other files. */
export function jpegJumbf(bytes: Uint8Array): Buffer[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return []
  const boxes = new Map<number, Array<{ z: number; data: Buffer }>>()
  let pos = 2
  while (pos + 4 <= buf.length && buf[pos] === 0xff) {
    const marker = buf[pos + 1]!
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      pos += marker === 0xff ? 1 : 2
      continue
    }
    const len = buf.readUInt16BE(pos + 2)
    if (len < 2 || pos + 2 + len > buf.length) break
    const payload = buf.subarray(pos + 4, pos + 2 + len)
    if (marker === 0xeb && payload.length >= 8 && payload[0] === 0x4a && payload[1] === 0x50) {
      const en = payload.readUInt16BE(2)
      const z = payload.readUInt32BE(4)
      const list = boxes.get(en) ?? []
      list.push({ z, data: payload.subarray(8) })
      boxes.set(en, list)
    }
    pos += 2 + len
  }
  const out: Buffer[] = []
  for (const packets of boxes.values()) {
    packets.sort((a, b) => a.z - b.z)
    const parts = packets.map((p, i) => {
      if (i === 0) return p.data
      // A continuation repeats the box's LBox and TBox, and XLBox when LBox is 1.
      const extended = p.data.length >= 4 && p.data.readUInt32BE(0) === 1
      return p.data.subarray(extended ? 16 : 8)
    })
    out.push(Buffer.concat(parts))
  }
  return out
}

function timesIn(buf: Buffer): string[] {
  const times: string[] = []
  for (let at = buf.indexOf(TST_INFO_OID); at !== -1; at = buf.indexOf(TST_INFO_OID, at + 1)) {
    try {
      times.push(generalizedToIso(genTimeAfter(buf, at + TST_INFO_OID.length)))
    } catch {
      // Not a time-stamp token after all, or a malformed one; keep looking.
    }
  }
  return times
}

/**
 * The latest time-stamp in the file's C2PA manifests, or null if it has none. A file's own
 * manifest is signed last, after any manifests it carries from its ingredients.
 */
export function c2paTimestamp(bytes: Uint8Array): string | null {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const times = [...timesIn(raw), ...jpegJumbf(bytes).flatMap(timesIn)]
  if (!times.length) return null
  return times.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)!
}

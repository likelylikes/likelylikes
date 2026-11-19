// Reads the RFC 3161 time-stamp a C2PA manifest carries, as the time a downloaded file was made.
//
// A C2PA claim signature carries a time-stamp token: CMS SignedData whose content is a TSTInfo,
// identified by the OID id-ct-TSTInfo. TSTInfo's fifth field is genTime, a GeneralizedTime. This
// finds each id-ct-TSTInfo in the file and parses the DER that follows; it does not validate the
// manifest or the token's signature. Certificates carry dates too, which is why it does not just
// look for date-shaped strings.

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

/** GeneralizedTime YYYYMMDDHHMMSS[.f]Z as the records write time: 2026-11-02T07:21:09+00:00. */
export function generalizedToIso(t: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(t)
  if (!m) throw new Error(`not a UTC GeneralizedTime: ${t}`)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}+00:00`
}

/**
 * The latest time-stamp in the file's C2PA manifests, or null if it has none. A file's own
 * manifest is signed last, after any manifests it carries from its ingredients.
 */
export function c2paTimestamp(bytes: Uint8Array): string | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const times: string[] = []
  for (let at = buf.indexOf(TST_INFO_OID); at !== -1; at = buf.indexOf(TST_INFO_OID, at + 1)) {
    try {
      times.push(generalizedToIso(genTimeAfter(buf, at + TST_INFO_OID.length)))
    } catch {
      // Not a time-stamp token after all; keep looking.
    }
  }
  if (!times.length) return null
  return times.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)!
}

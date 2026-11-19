// The game's D1 queries; the schema is migrations/0001_init.sql. Times are ms since the epoch,
// server clock. A D1 batch runs as one transaction: a failing statement rolls all of it back.

import { CONSISTENCY_WINDOW, realisedConsistency } from '../game/consistency.ts'

export interface SessionRow {
  id: string
  player_id: string
  set_id: string
  started_at: number
  ends_at: number
  gain: number
  picks: number
}

export interface RoundRow {
  id: string
  session_id: string
  player_id: string
  set_id: string
  seq: number
  /** The four image ids in screen order: position 0 to 3. */
  images: string[]
  selector: string
  served_at: number
}

/** A round with its session, and whether it is the session's latest round and already picked. */
export interface RoundState extends RoundRow {
  session: SessionRow
  current: boolean
  picked: boolean
}

export interface CountRow {
  winner: string
  loser: string
  n: number
}

/** The player in a set over all sessions: cumulative LLR in bits, picks, realised consistency. */
export interface Standing {
  llr: number
  picks: number
  consistency: number | null
}

export interface PickRecord {
  round: RoundState
  position: number
  image: string
  score: number
  estimator: string
  responseMs: number | null
  pickedAt: number
  /** The (winner, loser) pairs the pick adds 1 to. */
  updates: ReadonlyArray<readonly [string, string]>
  /** The round to serve next, or null when the session is over. */
  next: RoundRow | null
}

function insertRound(db: D1Database, r: RoundRow): D1PreparedStatement {
  return db
    .prepare('INSERT INTO rounds (id, session_id, player_id, set_id, seq, images, selector, served_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(r.id, r.session_id, r.player_id, r.set_id, r.seq, JSON.stringify(r.images), r.selector, r.served_at)
}

/**
 * Starts a session with its first round, in one transaction. The player row is inserted when it is
 * missing, so a cookie outlives a reset local database. Any other session of the player in the set
 * that could still take a pick is ended first, its ends_at set to `endOthersAt`, so two tabs cannot
 * interleave picks.
 */
export async function startSession(db: D1Database, s: SessionRow, first: RoundRow, endOthersAt: number): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO players (id, created_at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').bind(s.player_id, s.started_at),
    db.prepare('UPDATE sessions SET ends_at = ? WHERE player_id = ? AND set_id = ? AND ends_at > ?').bind(endOthersAt, s.player_id, s.set_id, endOthersAt),
    db.prepare('INSERT INTO sessions (id, player_id, set_id, started_at, ends_at, gain, picks) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(s.id, s.player_id, s.set_id, s.started_at, s.ends_at, s.gain, s.picks),
    insertRound(db, first),
  ])
}

export async function session(db: D1Database, id: string): Promise<SessionRow | null> {
  return db.prepare('SELECT id, player_id, set_id, started_at, ends_at, gain, picks FROM sessions WHERE id = ?').bind(id).first<SessionRow>()
}

export async function round(db: D1Database, id: string): Promise<RoundState | null> {
  const row = await db
    .prepare(
      `SELECT r.id, r.session_id, r.player_id, r.set_id, r.seq, r.images, r.selector, r.served_at,
              s.started_at, s.ends_at, s.gain, s.picks,
              r.seq = (SELECT MAX(seq) FROM rounds WHERE session_id = r.session_id) AS current,
              EXISTS (SELECT 1 FROM picks WHERE round_id = r.id) AS picked
         FROM rounds r JOIN sessions s ON s.id = r.session_id
        WHERE r.id = ?`,
    )
    .bind(id)
    .first<Omit<RoundRow, 'images'> & Omit<SessionRow, 'id' | 'player_id' | 'set_id'> & { images: string; current: number; picked: number }>()
  if (!row) return null
  return {
    id: row.id,
    session_id: row.session_id,
    player_id: row.player_id,
    set_id: row.set_id,
    seq: row.seq,
    images: JSON.parse(row.images) as string[],
    selector: row.selector,
    served_at: row.served_at,
    session: {
      id: row.session_id,
      player_id: row.player_id,
      set_id: row.set_id,
      started_at: row.started_at,
      ends_at: row.ends_at,
      gain: row.gain,
      picks: row.picks,
    },
    current: row.current === 1,
    picked: row.picked === 1,
  }
}

/** The counts of x's pair with each rival, in both directions; pairs never decided have no row. */
export async function pairCounts(db: D1Database, player: string, setId: string, x: string, rivals: readonly string[]): Promise<CountRow[]> {
  const marks = rivals.map(() => '?').join(', ')
  const { results } = await db
    .prepare(
      `SELECT winner, loser, n FROM counts
        WHERE player_id = ? AND set_id = ?
          AND ((winner = ? AND loser IN (${marks})) OR (loser = ? AND winner IN (${marks})))`,
    )
    .bind(player, setId, x, ...rivals, x, ...rivals)
    .all<CountRow>()
  return results
}

/** Every count of the player in the set. */
export async function allCounts(db: D1Database, player: string, setId: string): Promise<CountRow[]> {
  const { results } = await db.prepare('SELECT winner, loser, n FROM counts WHERE player_id = ? AND set_id = ?').bind(player, setId).all<CountRow>()
  return results
}

/**
 * Records a pick and serves the next round, in one transaction. The pick goes in first, so a second
 * pick of the same round fails the whole batch on the picks primary key and nothing of it lands.
 * Returns false when that happened: the round already has a pick.
 */
export async function recordPick(db: D1Database, p: PickRecord): Promise<boolean> {
  const r = p.round
  const statements = [
    db.prepare('INSERT INTO picks (round_id, player_id, set_id, position, image, score, estimator, response_ms, picked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(r.id, r.player_id, r.set_id, p.position, p.image, p.score, p.estimator, p.responseMs, p.pickedAt),
    ...p.updates.map(([winner, loser]) =>
      db.prepare('INSERT INTO counts (player_id, set_id, winner, loser, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (player_id, set_id, winner, loser) DO UPDATE SET n = n + 1')
        .bind(r.player_id, r.set_id, winner, loser)),
    db.prepare('INSERT INTO standings (player_id, set_id, llr, picks) VALUES (?, ?, ?, 1) ON CONFLICT (player_id, set_id) DO UPDATE SET llr = llr + excluded.llr, picks = picks + 1')
      .bind(r.player_id, r.set_id, p.score),
    db.prepare('UPDATE sessions SET gain = gain + ?, picks = picks + 1 WHERE id = ?').bind(p.score, r.session_id),
  ]
  if (p.next) statements.push(insertRound(db, p.next))
  try {
    await db.batch(statements)
    return true
  } catch (e) {
    // The batch rolled back. If the round has a pick now, another request's pick won the race.
    if (await db.prepare('SELECT 1 FROM picks WHERE round_id = ?').bind(r.id).first()) {
      console.warn(JSON.stringify({ level: 'warn', message: 'second pick of a round rolled back', round: r.id, error: e instanceof Error ? e.message : String(e) }))
      return false
    }
    throw e
  }
}

/** The player's standing in the set, or null before their first pick in it. */
export async function standing(db: D1Database, player: string, setId: string): Promise<Standing | null> {
  const [row, recent] = await Promise.all([
    db.prepare('SELECT llr, picks FROM standings WHERE player_id = ? AND set_id = ?').bind(player, setId).first<{ llr: number; picks: number }>(),
    db.prepare('SELECT score FROM picks WHERE player_id = ? AND set_id = ? ORDER BY picked_at DESC, rowid DESC LIMIT ?')
      .bind(player, setId, CONSISTENCY_WINDOW)
      .all<{ score: number }>(),
  ])
  if (!row || row.picks === 0) return null
  return { llr: row.llr, picks: row.picks, consistency: realisedConsistency(recent.results.map(s => s.score)) }
}

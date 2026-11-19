// The likelylikes Worker: the game's JSON API over D1, and each round's images at URLs that name
// only the round. It runs for /api/* and /data/* (wrangler.jsonc); the client is static assets.
// What it keeps to: screen positions are shuffled fresh for every round and never scored, and no
// URL or header names an image (docs/scoring.md §4.3, §9); a pick is scored from the counts as they
// stand before it, then counted (§3.2); the server is the clock.

import { ordering } from '../game/ordering.ts'
import { countsFrom, laplace, pickUpdates, scorePick } from '../game/scoring.ts'
import { cryptoRandomInt, shuffle, uniformSelector } from '../game/selection.ts'
import { assetsImageSource, type ImageSet, type ImageSource } from './images.ts'
import * as store from './store.ts'

const COOKIE = 'll_pid'
/** Two years, in seconds. */
const COOKIE_MAX_AGE = 63072000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** A pick counts if its round was served before the session ended and it arrives by the end plus this. */
const GRACE_MS = 2000
const NO_STANDING: store.Standing = { llr: 0, picks: 0, consistency: null }

interface Ctx {
  request: Request
  env: Env
  url: URL
  /** When the request arrived, in ms since the epoch: the game's clock. */
  now: number
  images: ImageSource
}

/** An error answered as `{ error, ...extra }` with its status. */
class HttpError extends Error {
  readonly status: number
  readonly extra: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

type Handler = (c: Ctx, ...params: string[]) => Promise<Response>

const ROUTES: Array<[method: string, path: RegExp, handler: Handler]> = [
  ['GET', /^\/api\/sets$/, listSets],
  ['POST', /^\/api\/sessions$/, startSession],
  ['GET', /^\/api\/sessions\/([^/]+)$/, getSession],
  ['POST', /^\/api\/rounds\/([^/]+)\/pick$/, pick],
  ['GET', /^\/api\/rounds\/([^/]+)\/([0-3])$/, roundImage],
  ['GET', /^\/api\/sets\/([^/]+)\/ordering$/, getOrdering],
  ['GET', /^\/api\/sets\/([^/]+)\/ordering\/([1-9][0-9]*)$/, orderingImage],
]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    try {
      return await route({ request, env, url, now: Date.now(), images: assetsImageSource(env.ASSETS) })
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status)
      console.error(JSON.stringify({
        level: 'error',
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        method: request.method,
        path: url.pathname,
      }))
      return json({ error: 'internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

async function route(c: Ctx): Promise<Response> {
  const path = c.url.pathname
  // The images and the catalogue: read through env.ASSETS only, never served as they are.
  if (path.startsWith('/data/')) throw new HttpError(404, 'not found')
  // Anything else that reaches the Worker outside the API is a static asset, or a plain 404.
  if (!path.startsWith('/api/')) return c.env.ASSETS.fetch(c.request)
  for (const [method, pattern, handler] of ROUTES) {
    const m = pattern.exec(path)
    if (m && c.request.method === method) return handler(c, ...m.slice(1).map(pathParam))
  }
  throw new HttpError(404, 'not found')
}

/** GET /api/sets: the sets, each with the player's standing in it, or null. */
async function listSets(c: Ctx): Promise<Response> {
  const player = cookiePlayer(c.request)
  const sets = await c.images.sets()
  const standings = await Promise.all(sets.map(s => (player ? store.standing(c.env.DB, player, s.id) : null)))
  return json({
    session_seconds: sessionSeconds(c.env),
    sets: sets.map((s, i) => ({
      id: s.id,
      question: s.question,
      n: s.n,
      large: s.large,
      published: s.published,
      standing: standings[i] ?? null,
    })),
  })
}

/** POST /api/sessions {set_id}: starts a timed session and serves its first round; sets the cookie when needed. */
async function startSession(c: Ctx): Promise<Response> {
  const body = await readBody(c.request)
  const setId = body['set_id']
  if (typeof setId !== 'string') throw new HttpError(400, 'set_id must be a string')
  const set = await requireSet(c, setId)
  const known = cookiePlayer(c.request)
  const player = known ?? crypto.randomUUID()
  const session: store.SessionRow = {
    id: crypto.randomUUID(),
    player_id: player,
    set_id: set.id,
    started_at: c.now,
    ends_at: c.now + sessionSeconds(c.env) * 1000,
    gain: 0,
    picks: 0,
  }
  const first = newRound(session, set, 1, c.now)
  await store.startSession(c.env.DB, session, first, c.now - GRACE_MS)
  const headers: Record<string, string> = known ? {} : { 'Set-Cookie': playerCookie(player, c.url) }
  return json({ session: sessionJson(session, set, c.now), standing: await standingOf(c, player, set.id), round: roundJson(first) }, 201, headers)
}

/** GET /api/sessions/<id>: the session and the player's standing, for the summary. */
async function getSession(c: Ctx, id: string): Promise<Response> {
  const player = requirePlayer(c)
  const session = await store.session(c.env.DB, id)
  if (!session || session.player_id !== player) throw new HttpError(404, 'unknown session')
  const set = await requireSet(c, session.set_id)
  return json({ session: sessionJson(session, set, c.now), standing: await standingOf(c, player, set.id) })
}

/**
 * POST /api/rounds/<id>/pick {position, response_ms}: scores the pick from the counts as they stand
 * before it, then records it, updates the counts and serves the next round while the session lasts.
 */
async function pick(c: Ctx, roundId: string): Promise<Response> {
  const player = requirePlayer(c)
  const round = await store.round(c.env.DB, roundId)
  if (!round || round.player_id !== player) throw new HttpError(404, 'unknown round')
  if (round.picked) throw new HttpError(409, 'already picked')
  if (!round.current) throw new HttpError(409, 'not the current round')
  const set = await requireSet(c, round.set_id)
  const endsAt = round.session.ends_at
  if (round.served_at >= endsAt || c.now > endsAt + GRACE_MS) {
    throw new HttpError(409, 'session over', { session: sessionJson(round.session, set, c.now), standing: await standingOf(c, player, set.id) })
  }

  const body = await readBody(c.request)
  const position = body['position']
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 0 || position > 3) {
    throw new HttpError(400, 'position must be 0, 1, 2 or 3')
  }
  const given = body['response_ms']
  let responseMs: number | null = null
  if (given !== undefined && given !== null) {
    if (typeof given !== 'number' || !Number.isFinite(given) || given < 0) throw new HttpError(400, 'response_ms must be a number of milliseconds')
    responseMs = Math.round(given)
  }

  const x = round.images[position]!
  // The scorer gets the quad in a fixed order, never in screen order.
  const quad = [...round.images].sort()
  const counts = countsFrom(await store.pairCounts(c.env.DB, player, set.id, x, quad.filter(i => i !== x)))
  const points = scorePick(laplace, counts, quad, x)
  const next = c.now < endsAt ? newRound(round.session, set, round.seq + 1, c.now) : null
  const recorded = await store.recordPick(c.env.DB, {
    round,
    position,
    image: x,
    score: points,
    estimator: laplace.id,
    responseMs,
    pickedAt: c.now,
    updates: pickUpdates(quad, x),
    next,
  })
  if (!recorded) throw new HttpError(409, 'already picked')

  const [session, standing] = await Promise.all([store.session(c.env.DB, round.session_id), standingOf(c, player, set.id)])
  if (!session) throw new Error(`session ${round.session_id} is gone after a pick`)
  return json({ points, session: sessionJson(session, set, c.now), standing, round: next && roundJson(next) })
}

/** GET /api/rounds/<id>/<position>: one image of the player's round. */
async function roundImage(c: Ctx, roundId: string, position: string): Promise<Response> {
  const player = requirePlayer(c)
  const round = await store.round(c.env.DB, roundId)
  if (!round || round.player_id !== player) throw new HttpError(404, 'unknown round')
  return imageResponse(c, round.set_id, round.images[Number(position)]!)
}

/** GET /api/sets/<id>/ordering: the player's ordering of the whole set by row sum (docs/scoring.md §6). */
async function getOrdering(c: Ctx, setId: string): Promise<Response> {
  const player = requirePlayer(c)
  const set = await requireSet(c, setId)
  const [{ rows, ranked }, standing] = await Promise.all([rankSet(c, player, set), store.standing(c.env.DB, player, set.id)])
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  for (const { winner, loser, n } of rows) {
    wins.set(winner, (wins.get(winner) ?? 0) + n)
    losses.set(loser, (losses.get(loser) ?? 0) + n)
  }
  return json({
    set_id: set.id,
    picks: standing?.picks ?? 0,
    images: ranked.map(({ image, r }, i) => ({
      rank: i + 1,
      r,
      wins: wins.get(image) ?? 0,
      losses: losses.get(image) ?? 0,
      url: `/api/sets/${encodeURIComponent(set.id)}/ordering/${i + 1}`,
    })),
  })
}

/** GET /api/sets/<id>/ordering/<rank>: the image at that rank of the player's ordering, recomputed now. */
async function orderingImage(c: Ctx, setId: string, rank: string): Promise<Response> {
  const player = requirePlayer(c)
  const set = await requireSet(c, setId)
  const entry = (await rankSet(c, player, set)).ranked[Number(rank) - 1]
  if (!entry) throw new HttpError(404, 'no image at that rank')
  return imageResponse(c, set.id, entry.image)
}

async function rankSet(c: Ctx, player: string, set: ImageSet) {
  const rows = await store.allCounts(c.env.DB, player, set.id)
  return { rows, ranked: ordering(laplace, countsFrom(rows), set.images) }
}

/** A new round of the session: four images of the set, in a fresh uniformly random screen order. */
function newRound(session: Pick<store.SessionRow, 'id' | 'player_id'>, set: ImageSet, seq: number, now: number): store.RoundRow {
  return {
    id: crypto.randomUUID(),
    session_id: session.id,
    player_id: session.player_id,
    set_id: set.id,
    seq,
    images: shuffle(uniformSelector.select(set.images, cryptoRandomInt), cryptoRandomInt),
    selector: uniformSelector.id,
    served_at: now,
  }
}

/** An image's bytes with its type and no-store, and no other header: nothing that could name the image. */
async function imageResponse(c: Ctx, setId: string, imageId: string): Promise<Response> {
  const file = await c.images.image(setId, imageId)
  if (!file) throw new HttpError(404, 'unknown image')
  return new Response(file.body, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-store' } })
}

function sessionJson(s: store.SessionRow, set: ImageSet, now: number) {
  return {
    id: s.id,
    set_id: s.set_id,
    question: set.question,
    remaining_ms: Math.max(0, s.ends_at - now),
    over: now >= s.ends_at,
    gain: s.gain,
    picks: s.picks,
  }
}

function roundJson(r: store.RoundRow) {
  return { id: r.id, seq: r.seq, images: r.images.map((_, position) => `/api/rounds/${r.id}/${position}`) }
}

async function standingOf(c: Ctx, player: string, setId: string): Promise<store.Standing> {
  return (await store.standing(c.env.DB, player, setId)) ?? NO_STANDING
}

async function requireSet(c: Ctx, id: string): Promise<ImageSet> {
  const set = await c.images.set(id)
  if (!set) throw new HttpError(404, 'unknown set')
  return set
}

/** The player id from the ll_pid cookie, or null when there is none or it is not a UUID. */
function cookiePlayer(request: Request): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== COOKIE) continue
    const value = part.slice(eq + 1).trim()
    if (UUID.test(value)) return value
  }
  return null
}

function requirePlayer(c: Ctx): string {
  const player = cookiePlayer(c.request)
  if (!player) throw new HttpError(401, 'no player cookie')
  return player
}

function playerCookie(id: string, url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure}`
}

function sessionSeconds(env: Env): number {
  const seconds = Number(env.SESSION_SECONDS)
  if (!(Number.isFinite(seconds) && seconds > 0)) throw new Error(`SESSION_SECONDS must be a positive number, not ${JSON.stringify(env.SESSION_SECONDS)}`)
  return seconds
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'the body must be JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'the body must be a JSON object')
  return body as Record<string, unknown>
}

function pathParam(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    throw new HttpError(404, 'not found')
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers })
}

// likelylikes client: home, play and results in one plain ES module, no build step.
//
// Three rules from docs/scoring.md §4.3 and §9 shape the play screen:
// - the four images of a round appear in the same frame, after all four have decoded;
// - nothing in the page tells the images apart but their pixels: a tile is named by its
//   position ("Option 1" to "Option 4"), DOM order is position order, and the only URL
//   is the round's opaque per-position one;
// - input is ignored from the moment of a pick until the next reveal, and neither the second click
//   of a double click nor a held key picks again after it.

const $ = (id) => document.getElementById(id);

const views = { home: $('home'), play: $('play'), results: $('results') };
const grid = $('grid');
const tiles = [...grid.querySelectorAll('.tile')];

const MINUS = '−';
const DASH = '—';

const state = {
  sessionSeconds: 60,
  setId: null,
  session: null,
  standing: null,
  round: null,
  lastPoints: null,
  phase: 'idle', // idle | waiting | live | picked | ending
  run: 0, // bumped when a play run starts or stops, so stale async work can tell
  deadline: 0, // performance.now() at which the session ends; re-synced from every response
  revealedAt: 0,
  timer: 0,
  pending: Promise.resolve(), // the pick in flight, if any
  homeToken: 0,
  orderingToken: 0,
};

// ---- formatting ------------------------------------------------------------

/** Bits and other plain numbers: fixed decimals, a real minus sign, never "-0.00". */
function fixed(v, digits = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DASH;
  const s = Math.abs(v).toFixed(digits);
  return v < 0 && Number(s) !== 0 ? MINUS + s : s;
}

/** Per-pick points: signed, two decimals, and the tone that colours them. */
function signed(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return { text: DASH, tone: 'zero' };
  const s = Math.abs(v).toFixed(2);
  if (Number(s) === 0) return { text: s, tone: 'zero' };
  return v > 0 ? { text: '+' + s, tone: 'up' } : { text: MINUS + s, tone: 'down' };
}

const consistency = (c) => (c == null ? DASH : fixed(c));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- small DOM helpers -----------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const note = (text) => el('p', 'note', text);

function show(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  window.scrollTo(0, 0);
}

// ---- errors: a small banner, never a blank screen --------------------------

function showError(message) {
  $('banner-text').textContent = message;
  $('banner').hidden = false;
}

function clearError() {
  $('banner').hidden = true;
}

$('banner-close').addEventListener('click', clearError);
window.addEventListener('error', (e) => showError(e.message || 'Something went wrong.'));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.message || 'Something went wrong.'));

// ---- API -------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(method, path, body) {
  const init = { method, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('The server could not be reached.', 0, null);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // not JSON; handled below
  }
  if (!res.ok) {
    const message = data && typeof data.error === 'string' ? data.error : `Request failed (HTTP ${res.status}).`;
    throw new ApiError(message, res.status, data);
  }
  if (data === null || typeof data !== 'object') {
    throw new ApiError('The server sent a response that is not JSON.', res.status, null);
  }
  return data;
}

// ---- home ------------------------------------------------------------------

async function goHome() {
  stopPlay();
  clearError();
  show('home');
  const token = ++state.homeToken;
  const box = $('sets');
  box.replaceChildren(note('Loading…'));
  try {
    const data = await api('GET', '/api/sets');
    if (token !== state.homeToken) return;
    if (typeof data.session_seconds === 'number') state.sessionSeconds = data.session_seconds;
    const sets = Array.isArray(data.sets) ? data.sets : [];
    box.replaceChildren(...(sets.length ? sets.map(renderSet) : [note('No image sets yet.')]));
  } catch (err) {
    if (token !== state.homeToken) return;
    showError(err.message);
    box.replaceChildren(note('The image sets could not be loaded.'), button('Try again', 'btn', goHome));
  }
}

function renderSet(set) {
  const card = el('article', 'card');
  const meta = el('p', 'meta');
  meta.append(el('span', null, plural(set.n, 'image')));
  if (set.large) meta.append(el('span', 'mark', 'large set'));
  if (set.published == null) meta.append(el('span', 'mark proto', 'prototype'));
  const st = set.standing;
  const standing = st
    ? el('p', 'standing', `Total LLR ${fixed(st.llr)} bits · ${plural(st.picks, 'pick')} · consistency ${consistency(st.consistency)}`)
    : el('p', 'standing none', 'Not played yet');
  const play = button(`Play ${state.sessionSeconds} s`, 'btn primary', (e) => start(set.id, e.currentTarget));
  card.append(el('h2', 'card-question', set.question), meta, standing, play);
  return card;
}

// ---- play ------------------------------------------------------------------

async function start(setId, trigger) {
  clearError();
  if (trigger) trigger.disabled = true;
  try {
    const data = await api('POST', '/api/sessions', { set_id: setId });
    state.setId = setId;
    beginPlay(data);
  } catch (err) {
    showError(err.message);
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

function stopPlay() {
  state.run += 1;
  state.phase = 'idle';
  state.round = null;
  clearInterval(state.timer);
}

function beginPlay({ session, standing, round }) {
  stopPlay();
  const run = state.run;
  state.session = session;
  state.standing = standing;
  state.lastPoints = null;
  state.pending = Promise.resolve();
  $('play-question').textContent = session.question;
  renderBar();
  clearGrid();
  show('play');
  syncClock(session);
  if (session.over || !round) {
    finish(run);
    return;
  }
  reveal(round, run);
  startTicker(run);
}

function syncClock(session) {
  const remaining = typeof session.remaining_ms === 'number' ? session.remaining_ms : 0;
  state.deadline = performance.now() + Math.max(0, remaining);
}

function startTicker(run) {
  clearInterval(state.timer);
  const tick = () => {
    const left = state.deadline - performance.now();
    $('p-time').textContent = clock(left);
    if (left <= 0) finish(run);
  };
  tick();
  state.timer = setInterval(tick, 100);
}

function renderBar() {
  const s = state.session;
  const st = state.standing;
  $('p-gain').textContent = fixed(s ? s.gain : 0);
  const last = $('p-last');
  const points = state.lastPoints == null ? { text: DASH, tone: 'zero' } : signed(state.lastPoints);
  last.textContent = points.text;
  last.className = points.tone;
  $('p-llr').textContent = fixed(st ? st.llr : 0);
  $('p-cons').textContent = consistency(st ? st.consistency : null);
}

/** The neutral placeholder: four empty tiles that ignore input. */
function clearGrid() {
  grid.dataset.state = 'waiting';
  grid.setAttribute('aria-busy', 'true');
  for (const tile of tiles) {
    tile.replaceChildren();
    tile.classList.remove('chosen');
    tile.setAttribute('aria-disabled', 'true');
  }
}

async function reveal(round, run) {
  if (run !== state.run || state.phase === 'ending') return;
  state.phase = 'waiting';
  state.round = round;
  clearGrid();
  const urls = Array.isArray(round.images) ? round.images : [];
  if (urls.length !== tiles.length) {
    showError('The server sent a round without four images.');
    finish(run);
    return;
  }
  // urls[p] is the image at screen position p; it names the round and the position only.
  const images = urls.map((url, position) => {
    const img = new Image();
    img.alt = `Option ${position + 1}`;
    img.draggable = false;
    img.src = url;
    return img;
  });
  try {
    await Promise.all(images.map((img) => img.decode()));
  } catch {
    if (run === state.run && state.round === round && state.phase === 'waiting') {
      showError('The images for this round could not be loaded.');
      finish(run);
    }
    return;
  }
  if (run !== state.run || state.round !== round || state.phase !== 'waiting') return;
  // The reveal: all four go in during one synchronous step, so they are painted in the
  // same frame, whatever order they arrived in.
  images.forEach((img, position) => tiles[position].replaceChildren(img));
  // Input opens with the frame that paints them, not before.
  requestAnimationFrame(() => {
    if (run !== state.run || state.round !== round || state.phase !== 'waiting') return;
    state.phase = 'live';
    state.revealedAt = performance.now();
    grid.dataset.state = 'live';
    grid.removeAttribute('aria-busy');
    for (const tile of tiles) tile.removeAttribute('aria-disabled');
  });
}

async function pick(position) {
  if (state.phase !== 'live') return;
  if (performance.now() >= state.deadline) return; // the ticker ends play on its next beat
  state.phase = 'picked'; // from here until the next reveal, input is ignored
  const responseMs = Math.round(performance.now() - state.revealedAt);
  const run = state.run;
  const round = state.round;
  grid.dataset.state = 'picked';
  grid.setAttribute('aria-busy', 'true');
  for (const tile of tiles) tile.setAttribute('aria-disabled', 'true');
  tiles[position].classList.add('chosen');

  const request = api('POST', `/api/rounds/${encodeURIComponent(round.id)}/pick`, {
    position,
    response_ms: responseMs,
  });
  state.pending = request.then(
    () => {},
    () => {},
  );
  let data;
  try {
    data = await request;
  } catch (err) {
    if (run !== state.run) return;
    if (err.status === 409 && err.data && err.data.error === 'session over') {
      if (err.data.session) state.session = err.data.session;
      if (err.data.standing) state.standing = err.data.standing;
      renderBar();
    } else {
      showError(err.message);
    }
    finish(run);
    return;
  }
  if (run !== state.run) return;
  state.session = data.session;
  state.standing = data.standing;
  state.lastPoints = data.points;
  syncClock(data.session);
  renderBar();
  if (!data.round || data.session.over) {
    finish(run);
    return;
  }
  reveal(data.round, run);
}

/** End play: no more picks, let a pick in flight land, then fetch the summary. */
async function finish(run) {
  if (run !== state.run || state.phase === 'ending') return;
  state.phase = 'ending';
  clearInterval(state.timer);
  $('p-time').textContent = clock(0);
  grid.dataset.state = 'ended';
  for (const tile of tiles) tile.setAttribute('aria-disabled', 'true');
  await state.pending;
  if (run !== state.run) return;
  try {
    const data = await api('GET', `/api/sessions/${encodeURIComponent(state.session.id)}`);
    if (run !== state.run) return;
    state.session = data.session;
    state.standing = data.standing;
  } catch (err) {
    if (run !== state.run) return;
    showError(err.message); // the results then show the last state the client saw
  }
  stopPlay();
  showResults();
}

// On a fast server the next round is live within 100 ms of a pick, so the second click of a double
// click (detail 2) lands on it. One that soon after a reveal is no choice: drop it. A later click with
// detail 2 is a quick deliberate pick of the same tile, and counts.
tiles.forEach((tile, position) =>
  tile.addEventListener('click', (e) => {
    if (e.detail > 1 && performance.now() - state.revealedAt < 200) return;
    pick(position);
  }),
);

document.addEventListener('keydown', (e) => {
  if (views.play.hidden) return;
  // A held key picks once. Its auto-repeats are cancelled, not just ignored: on a focused tile the
  // browser turns each repeated Enter into another click, a pick in every round while it is held.
  if (e.repeat) {
    e.preventDefault();
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const position = ['1', '2', '3', '4'].indexOf(e.key);
  if (position === -1) return;
  e.preventDefault();
  pick(position);
});

// ---- results ---------------------------------------------------------------

function showResults() {
  const s = state.session;
  const st = state.standing;
  $('r-question').textContent = s.question;
  $('r-gain').textContent = fixed(s.gain);
  $('r-picks').textContent = String(s.picks);
  $('r-rate').textContent = s.picks > 0 ? fixed(s.gain / s.picks) : DASH;
  $('r-llr').textContent = st ? fixed(st.llr) : DASH;
  $('r-cons').textContent = consistency(st ? st.consistency : null);
  renderOdds(s.gain);
  show('results');
  loadOrdering(state.setId);
}

/**
 * scoring.md §4.3: a random clicker reaches a gain of b bits with probability at most 2^-b. N and the
 * exponent are rounded down, so the line never claims more than the bound does.
 */
function renderOdds(gain) {
  const odds = $('r-odds');
  const n = typeof gain === 'number' && gain > 0 ? Math.floor(2 ** gain) : 0;
  odds.hidden = n < 2; // below 2, "at most 1 in 1" says nothing
  if (n < 2) return;
  const lead = 'A random clicker does this well with probability at most 1 in ';
  if (n < 1e15) odds.textContent = `${lead}${n.toLocaleString('en-US')}.`;
  else odds.replaceChildren(`${lead}2`, el('sup', null, (Math.floor(gain * 10) / 10).toFixed(1)), '.');
}

async function loadOrdering(setId) {
  const token = ++state.orderingToken;
  const list = $('r-ordering');
  const caption = $('r-ordering-note');
  list.replaceChildren();
  caption.textContent = 'Loading…';
  let data;
  try {
    data = await api('GET', `/api/sets/${encodeURIComponent(setId)}/ordering`);
  } catch (err) {
    if (token !== state.orderingToken) return;
    caption.textContent = 'The ordering could not be loaded.';
    showError(err.message);
    return;
  }
  if (token !== state.orderingToken) return;
  const images = Array.isArray(data.images) ? data.images : [];
  caption.textContent = `From ${plural(data.picks, 'pick')}. Under each image: rank, r in bits, wins–losses.`;
  list.replaceChildren(...images.map((item) => renderRanked(item, data.picks)));
}

/**
 * One ranked image. A rank's URL shows another image once the counts change, and a browser reuses an
 * image it has already loaded for a URL in the same page, no-store or not (the HTML "list of available
 * images"). So the URL carries the pick count the ordering was computed from, which changes exactly
 * when the counts do; the Worker routes on the path alone.
 */
function renderRanked(item, picks) {
  const li = el('li', 'ranked');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 640;
  img.height = 640;
  img.alt = `Rank ${item.rank}`;
  img.src = `${item.url}?v=${picks}`;
  const cap = el('div', 'cap');
  cap.append(
    el('span', 'rank', String(item.rank)),
    el('span', 'r', fixed(item.r, 1)),
    el('span', 'wl', `${item.wins}–${item.losses}`),
  );
  li.append(img, cap);
  return li;
}

$('r-again').addEventListener('click', (e) => start(state.setId, e.currentTarget));
$('r-home').addEventListener('click', goHome);

goHome();

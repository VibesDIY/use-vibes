// Pickathon Picker backend: serve faves schedules as .ics.
//
// POST /_api/faves.ics  { items: [{ id, title, start, end, location?, url? }] }
//   → 200 text/calendar attachment (pickathon-faves.ics) — one-shot download of
//   whatever the client sends (works for anonymous local-only faves too).
// GET  /_api/faves.ics?t=<token>
//   → 200 text/calendar — the SUBSCRIPTION lane (webcal://). The token is a
//   per-user RANDOM CAPABILITY (a `caltoken` doc, auto-minted client-side the
//   first time the user opens their schedule tab — opt-in: no visit, no token,
//   no feed at all). Unlike the earlier handle-keyed URL it is unguessable
//   (a handle in the URL invited swapping in someone else's), shareable on
//   purpose, and revocable (delete the doc; the feed drains). It is still a
//   live feed: new picks flow to every subscriber without re-subscribing, and
//   set times come from a fresh join against the live pickathon.com schedule
//   feed (platform egress) on every refresh.
//
// How the anonymous GET learns a user's favorites: it READS THEM, at request
// time, with keyed reads. `config.fetch.unfilteredReads` (#3650) declares the
// one db this feed needs, which lifts both the anonymous deny and the
// access-fn-bound deny on this lane — so authorization becomes THIS file's job,
// and the `t=` capability token is how it does it. The reads are keyed and
// paged (`ctx.db.get` by id; `ctx.db.query` with `field`+`key`/`keys`, `limit`
// and the `after` cursor — #4398), never a whole-db scan:
//
//   1. `t=` → the caltoken doc. `n=` (the display hint the client already puts
//      in the URL) makes that one `ctx.db.get("caltoken-<n>")`; the token in
//      the doc must equal the token presented, so a wrong or hostile `n` buys
//      nothing and falls back to a paged `field: "token"` lookup.
//   2. handle → that user's favorites and shared shifts, one paged
//      `field: "userId"` read.
//   3. favorite eventIds → the live pickathon.com schedule, joined per request.
//
// This replaced a 1-minute `scheduled` tick that read the WHOLE db, aggregated
// handle → picks into module state, and had the GET serve from that in-isolate
// cache. The host caps a scan at 2000 docs sorted by `_id` and says nothing
// (backend-db-callback.ts); this db passed 2000 during Pickathon 2026 and every
// favorite sorting after the cut went silently missing from its owner's feed —
// ~43% of users. The cache also meant a just-minted token served nothing until
// the next tick, which iOS shows as "Validation failed" at subscribe time.
// Request-time reads fix both: correct at any db size, and current to the
// second. The GET is now the only reader of user data.
//
// What the `scheduled` tick is still for (and only this): the central schedule
// MIRROR — one public `scheduleitem` doc per festival event, which is what
// every client renders from, offline — plus a roughly-hourly liveness
// heartbeat. Both remember their own state in docs read BY ID, backed by an
// in-isolate copy; neither reads more than a handful of docs, whatever the db
// grows to. No user data passes through the tick at all any more, so its
// cadence dropped from 1m to 5m (the mirror's own interval — a festival
// schedule does not change every 60 seconds, and a cadence is a standing bill).
//
// Privacy is unchanged, and now enforced per request: a feed is reachable only
// through its random token, so nothing is exposed to handle-guessing. Notes are
// never read into a response; shifts are included only with shareWithFriends;
// a user with no token has no feed. The unfilteredReads declaration is scoped
// per LANE, not per route — every path inside `fetch` can read this db — so the
// only reads in here are the three above, and the only thing that decides what
// leaves is this file.
//
// This file runs ALONE in the backend isolate — no import resolution — so the
// few festival-utils timezone helpers it needs are duplicated here on purpose.

export const PICKATHON_DB = 'pickathon';

export const config = {
  scheduled: { interval: '5m' },
  fetch: {
    unfilteredReads: {
      dbs: ['pickathon'],
      why: 'GET /faves.ics?t=<token> is an anonymous calendar-subscription feed: calendar clients present an unguessable per-user capability token, never a session. The handler resolves that token to the handle that owns it and then reads only that handle docs — favorites and shareWithFriends shifts, keyed and paged. Notes and other people docs are never read into a response.',
    },
  },
};

const FESTIVAL_TZ = 'America/Los_Angeles';

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
const ensureT = (s = '') => (s.includes('T') ? s : s.replace(' ', 'T'));

// Same offset trick as festival-utils.js: format the instant in the festival
// zone, re-read it as if it were UTC, and the difference is the zone offset.
// Handles DST correctly for any date (festival is PDT, but don't hardcode -7).
const _offsetFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: FESTIVAL_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const tzOffsetMinutes = (date) => {
  const p = Object.fromEntries(_offsetFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asIfUTC - date.getTime()) / 60000;
};

const parseToDate = (s) => {
  if (typeof s !== 'string' || s === '') return null;
  const t = ensureT(s);
  let d;
  if (hasExplicitTZ(t)) {
    d = new Date(t);
  } else {
    const utcGuess = new Date(t + 'Z');
    if (isNaN(utcGuess)) return null;
    d = new Date(utcGuess.getTime() - tzOffsetMinutes(utcGuess) * 60000);
  }
  return isNaN(d) ? null : d;
};

const epochToIcs = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

// A schedule string (naive festival-local like "2026-07-31T13:00:00", or with an
// explicit offset/Z) → ICS UTC basic format "20260731T200000Z", or null if it
// doesn't parse. UTC-basic strings sort lexicographically, which buildFavesCalendar
// relies on for event ordering.
export const toIcsUtc = (s) => {
  const d = parseToDate(s);
  return d === null ? null : epochToIcs(d.getTime());
};

// RFC 5545 §3.3.11 TEXT escaping. Backslash first, or it would double-escape
// the escapes it just produced.
export const escapeIcsText = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

// RFC 5545 §3.1 line folding: content lines cap at 75 OCTETS (not chars), and a
// continuation line's leading space counts toward its own 75. Folding must not
// split a UTF-8 character, so count bytes per code point instead of encoding.
const utf8Octets = (ch) => {
  const c = ch.codePointAt(0);
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};
export const foldIcsLine = (line) => {
  const parts = [];
  let cur = '';
  let bytes = 0;
  let budget = 75; // continuations get 74: the leading fold space spends one octet
  for (const ch of line) {
    const len = utf8Octets(ch);
    if (bytes + len > budget) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      budget = 74;
    }
    cur += ch;
    bytes += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
};

// Caps: strict enough that a forged payload can't make us stream megabytes back,
// loose enough that a maximal real schedule (every set + every shift) fits.
export const MAX_ITEMS = 500;
const MAX_TEXT = 300;
const MAX_URL = 1000;
const MAX_ID = 200;

// Per-item validation/normalization shared by both lanes. Strict on the fields
// that structure the calendar (title, start, end); silently drops decorations
// that are merely unusable (non-http url).
export const validateFavesItem = (it) => {
  if (it === null || typeof it !== 'object') return { ok: false, error: 'must be an object' };
  const title = typeof it.title === 'string' ? it.title.trim() : '';
  if (title === '') return { ok: false, error: 'title must be a non-empty string' };
  const startDate = parseToDate(it.start);
  if (startDate === null) return { ok: false, error: 'start is not a parseable time' };
  const endDate = parseToDate(it.end);
  if (endDate === null) return { ok: false, error: 'end is not a parseable time' };
  let endMs = endDate.getTime();
  // RFC 5545 requires DTEND strictly later than DTSTART. end === start is a
  // meaningless entry — reject it. end BEFORE start is a real shape, not junk:
  // the extras form stores both times on the selected festival day, so an
  // overnight shift (22:00 → 01:00) arrives as same-day strings — normalize it
  // to end the next day. (+24h in absolute time; festival dates never straddle
  // a DST change, so local wall time is preserved.)
  if (endMs === startDate.getTime())
    return { ok: false, error: 'has zero duration (end equals start)' };
  if (endMs < startDate.getTime()) endMs += 24 * 60 * 60 * 1000;
  // Still not after start ⇒ end was more than a day early — corrupt, not overnight.
  if (endMs <= startDate.getTime()) return { ok: false, error: 'end is before its start' };
  const item = {
    title: title.slice(0, MAX_TEXT),
    start: epochToIcs(startDate.getTime()),
    end: epochToIcs(endMs),
  };
  if (typeof it.location === 'string' && it.location.trim() !== '') {
    item.location = it.location.trim().slice(0, MAX_TEXT);
  }
  // URL is a URI-valued property emitted VERBATIM (no TEXT escaping — see
  // buildFavesCalendar), so beyond the scheme check it must contain no
  // whitespace or control chars: an embedded CR/LF would inject ICS lines.
  if (
    typeof it.url === 'string' &&
    /^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(it.url) &&
    it.url.length <= MAX_URL
  ) {
    item.url = it.url;
  }
  if (typeof it.id === 'string' && it.id !== '') item.id = it.id.slice(0, MAX_ID);
  return { ok: true, item };
};

// STRICT, all-or-nothing — the POST download lane, where the client authored
// the payload and deserves a precise index-named rejection.
export const parseFavesItems = (payload) => {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    return { ok: false, error: 'body must be { items: [...] }' };
  }
  const raw = payload.items;
  if (raw.length === 0) return { ok: false, error: 'no items to export' };
  if (raw.length > MAX_ITEMS) return { ok: false, error: `too many items (max ${MAX_ITEMS})` };
  const items = [];
  for (let i = 0; i < raw.length; i++) {
    const r = validateFavesItem(raw[i]);
    if (!r.ok) {
      // Field-scoped errors read as items[i].field…, item-level ones as items[i] …
      const sep = /^(title|start|end)\b/.test(r.error) ? '.' : ' ';
      return { ok: false, error: `items[${i}]${sep}${r.error}` };
    }
    items.push(r.item);
  }
  return { ok: true, items };
};

// LENIENT, per-item — the subscription lane. Its rows come from the db
// aggregate and the schedule feed, neither of which the subscriber controls,
// so one malformed row (e.g. a legacy shift saved as `<date>T:00`) must drop
// out, not 400 the user's whole feed (Charlie, #3258 review).
export const sanitizeFavesItems = (rows) =>
  rows
    .map((row) => validateFavesItem(row))
    .filter((r) => r.ok)
    .map((r) => r.item);

// ── Subscription (GET) lane ──────────────────────────────────────────────────

export const SCHEDULE_URL = 'https://pickathon.com/wp-content/plugins/pickathon/schedule.php';

// The feed HTML-entity-encodes titles ("Skills &amp; Games"). The frontend
// decodes with a <textarea>; there's no DOM in the isolate, so decode the
// named entities the feed actually uses plus numeric forms. Unknown entities
// pass through as literal text — harmless in SUMMARY once TEXT-escaped.
export const decodeFeedEntities = (s) => {
  if (typeof s !== 'string' || !s.includes('&')) return s;
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return named[body.toLowerCase()] ?? m;
  });
};

// Festival day → calendar date, for legacy shift docs stored without absolute
// start/end (they carry day + startTime/endTime only). Mirrors FESTIVAL_2026.
const FESTIVAL_DATES = {
  Thursday: '2026-07-30',
  Friday: '2026-07-31',
  Saturday: '2026-08-01',
  Sunday: '2026-08-02',
  Monday: '2026-08-03',
};

const shiftStartOf = (s) =>
  s.start ??
  (FESTIVAL_DATES[s.day] && s.startTime ? `${FESTIVAL_DATES[s.day]}T${s.startTime}:00` : null);
const shiftEndOf = (s) =>
  s.end ?? (FESTIVAL_DATES[s.day] && s.endTime ? `${FESTIVAL_DATES[s.day]}T${s.endTime}:00` : null);

// ── Reading the db ───────────────────────────────────────────────────────────
// One page is one round trip to the host, and the host caps a page at 2000 docs
// however large a `limit` asks for. PAGE_LIMIT trades round trips against the
// size of the JSON body crossing the isolate boundary; MAX_PAGES bounds the
// work ONE anonymous request can ask for, because this lane is reachable by
// anybody with a URL.
export const PAGE_LIMIT = 500;
const MAX_PAGES = 40;

// Read every doc matching a keyed query, page by page.
//
// The trap this exists to hold: the host filters AFTER cutting the page, so a
// full page can filter down to ZERO docs and still carry a `next` cursor. A
// loop that stops when a page comes back empty silently loses every doc behind
// it — which for this feed means "your picks are gone". Loop on `next`, never
// on emptiness. `next` is undefined exactly when the page was not full, i.e.
// when the read is genuinely finished.
const STOP = Symbol('stop');
const readAllPages = async (ctx, options, onDocs) => {
  let after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await ctx.db.query({
      db: PICKATHON_DB,
      limit: PAGE_LIMIT,
      ...options,
      ...(after === undefined ? {} : { after }),
    });
    const docs = Array.isArray(rows) ? rows : (rows && rows.docs) || [];
    if (onDocs(docs) === STOP) return true;
    after = rows && rows.next;
    if (!after) return true;
  }
  // Bounded, and loud about it: better a short answer than an unbounded scan
  // paid for by whoever loads the page behind this one on the same DO.
  console.warn(
    `pickathon feed: stopped a paged read after ${MAX_PAGES} pages (${JSON.stringify(options)}).`
  );
  return false;
};

// ── Load shedding ────────────────────────────────────────────────────────────
// One owner-written config doc (`_id: 0-load-shed`, `level: off|read-only|
// schedule-only` — see loadshed.js, which the client imports and this file
// cannot: the backend isolate resolves no imports, so the id/type are duplicated
// here on purpose and pinned by loadshed.test.js).
//
// What sheds here, and what deliberately does NOT:
//   · the SUBSCRIPTION lane (GET /faves.ics?t=…) answers 503 + Retry-After,
//     BEFORE the token lookup, the picks read and the feed join — shedding the
//     viewer work is the entire point. Calendar clients back off on a 503 and
//     keep the events they already synced, so this is the one shed with no
//     user-visible damage — an empty calendar would look like "your picks are
//     gone".
//   · the `scheduled` tick does not shed at all any more. It no longer touches
//     user data or scales with traffic: it is one keyed read plus, at most every
//     5 minutes, one feed fetch. The liveness HEARTBEAT keeps beating (a shed
//     tick is still a tick that ran, and that doc is the only durable evidence
//     of it — #4305), and the SCHEDULE MIRROR keeps running, because the
//     schedule staying fresh is the whole reason to stay up.
//
// The GET reads the switch itself, by id, on each request — so flipping it takes
// effect on the next request rather than after the next tick. Two readings of
// "no level", and they are NOT the same:
//   · the read came back EMPTY — a keyed get is authoritative about absence, so
//     a deleted doc means shedding is off. (The old capped-scan design could not
//     tell "deleted" from "sorted off the end", which is why it had to keep
//     shedding and why the runbook said never to delete the doc.)
//   · the read FAILED — that is "don't know", so keep the level this isolate
//     last saw. Never "shedding is off": that reading would re-open the very
//     load spike the switch was flipped for (§4a).
// An isolate that has never seen the doc and cannot read it fails OPEN — normal
// service is the only safe default for a switch we cannot see.
export const LOADSHED_ID = '0-load-shed';
export const LOADSHED_TYPE = 'loadshed';
export const SHED_OFF = 'off';
export const SHED_READ_ONLY = 'read-only';
export const SHED_SCHEDULE_ONLY = 'schedule-only';
export const SHED_RETRY_AFTER_SECONDS = 900;
const SHED_LEVELS = [SHED_OFF, SHED_READ_ONLY, SHED_SCHEDULE_ONLY];

let shedLevel = null; // null = this isolate has never seen the doc
export const __resetShedForTests = () => {
  shedLevel = null;
};

// Fail-open parse, byte-identical in behaviour to loadshed.js's shedLevelOf:
// only an exactly-recognized level sheds anything, so a fat-fingered `db put`
// at 11pm on a Saturday cannot brick the app.
const parseShedLevel = (doc) => {
  const raw = doc && typeof doc.level === 'string' ? doc.level.trim().toLowerCase() : '';
  return SHED_LEVELS.includes(raw) ? raw : SHED_OFF;
};

// Read the switch by id — one `ctx.db.get`, no scan, current as of this request
// — and remember it. See § Load shedding for why an empty read and a failed read
// give different answers.
export const readShedLevel = async (ctx) => {
  if (!ctx || !ctx.db || typeof ctx.db.get !== 'function') return shedLevel ?? SHED_OFF;
  try {
    const doc = await ctx.db.get(LOADSHED_ID, { db: PICKATHON_DB });
    shedLevel = doc ? parseShedLevel(doc) : SHED_OFF;
    return shedLevel;
  } catch (err) {
    console.warn(
      `pickathon feed: could not read ${LOADSHED_ID} (${String((err && err.message) || err)}) — ` +
        `keeping the in-isolate level "${shedLevel ?? SHED_OFF}".`
    );
    return shedLevel ?? SHED_OFF;
  }
};

// Whether a level pauses viewer amplification. `null` (this isolate has never
// seen the doc) and `off` both read as not shedding.
const isSheddingLevel = (level) => level === SHED_READ_ONLY || level === SHED_SCHEDULE_ONLY;

// The 5-minute tick. It exists for exactly two jobs, and NEITHER of them
// touches user data: stamp the liveness heartbeat, and keep the central
// schedule mirror in step with pickathon.com. There is no aggregate here any
// more — the `.ics` GET reads what it needs when it is asked (see the header) —
// so nothing about this tick's cost or correctness depends on how big the db
// has grown. Both jobs remember their own state in a doc read BY ID, plus an
// in-isolate copy; the tick reads two docs and, at most every
// SCHEDULE_SYNC_INTERVAL_MS, fetches the feed. It writes nothing unless the
// festival schedule actually changed.
export async function scheduled(event, ctx) {
  // Liveness first: if this tick is alive, say so before anything that can fail.
  await writeHeartbeat(event, ctx);
  // Central schedule mirror: refresh pickathon.com on its own cadence and upsert
  // only the `scheduleitem` docs whose content changed. Clients read the
  // schedule from these public docs — nobody fetches the feed per-user anymore.
  // It never wipes the schedule on a transient feed failure.
  await syncScheduleDocs(event, ctx);
}

// One doc, by id, tolerating a lane that cannot read (the POST download lane
// passes no ctx at all) and a read that fails. `null` means "no doc"; `undefined`
// means "could not tell" — a distinction both callers care about (§4a).
const getDoc = async (ctx, id) => {
  if (!ctx || !ctx.db || typeof ctx.db.get !== 'function') return undefined;
  try {
    return (await ctx.db.get(id, { db: PICKATHON_DB })) ?? null;
  } catch (err) {
    return undefined;
  }
};

// ── Tick liveness heartbeat (scheduled lane) ─────────────────────────────────
// The `scheduled` alarm has gone silently dead twice on unchanged code, and a
// vibe backend's console output is forwarded NOWHERE (platform #4305) — so the
// ONLY durable, queryable evidence that the tick ran is a WRITE. Roughly hourly
// the tick stamps one doc with the scheduled time it woke at.
//
// Ops read path (platform admin):
//   vibes-diy db get 0-tick-heartbeat --db pickathon --vibe og/pickathon-picker
// A stamp older than ~2h means the alarm is dead and the app needs a redeploy
// (nothing else re-arms an app with no other traffic). Treat ~2h of slack as
// normal: the gate below is in-isolate and best-effort, not a promise.
//
// Discipline is the #4293 one. The gate is remembered, never re-derived from a
// scan: an in-isolate timestamp, backed by the heartbeat doc read BY ID — one
// keyed `ctx.db.get`, reachable at any db size, with no sort window to fall out
// of. Whichever of the two is newer wins, and a doc that is missing or
// unreadable reads as "don't know" rather than "never beat". Only losing BOTH —
// no doc AND a cold isolate — writes a beat immediately, which is the harmless
// direction: one extra write per isolate boot, not one per tick.
//
// The stamp must CHANGE on every write or the platform dedupes a content-
// identical re-put invisibly and the doc silently stops tracking liveness —
// hence `at`, the tick's own scheduled time.
export const HEARTBEAT_ID = '0-tick-heartbeat';
export const HEARTBEAT_TYPE = 'heartbeat';
export const HEARTBEAT_INTERVAL_MS = 55 * 60 * 1000;
let lastBeatAt = null;
export const __resetHeartbeatForTests = () => {
  lastBeatAt = null;
};

export const writeHeartbeat = async (event, ctx) => {
  if (!ctx || !ctx.db || typeof ctx.db.put !== 'function') return null;
  const now = Date.parse(event?.scheduledTime) || Date.now();
  const doc = await getDoc(ctx, HEARTBEAT_ID);
  // A missing doc, an unreadable read, and an unparseable stamp all land on NaN,
  // which the filter below drops — leaving the in-isolate copy to answer, and a
  // cold isolate with no evidence at all to beat once.
  const docAt = doc ? Date.parse(doc.at) : NaN;
  const known = [lastBeatAt, Number.isFinite(docAt) ? docAt : null].filter((n) => n !== null);
  const last = known.length > 0 ? Math.max(...known) : null;
  if (last !== null && now - last < HEARTBEAT_INTERVAL_MS) return { ok: true, skipped: 'not due' };
  const at = new Date(now).toISOString();
  await ctx.db.put({ _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at }, { db: 'pickathon' });
  lastBeatAt = now;
  return { ok: true, at };
};

// Fetch the live schedule feed and project the requested event ids into items.
// MUST call globalThis.fetch — bare `fetch` here resolves to this module's own
// exported handler, not the global (module scope shadows the isolate global).
export const fetchScheduleItems = async (ids) => {
  const wanted = new Set(ids);
  const res = await globalThis.fetch(SCHEDULE_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`schedule feed ${res.status}`);
  const data = await res.json();
  const items = [];
  for (const vid in data) {
    const venue = data[vid];
    if (!venue || !Array.isArray(venue.events)) continue;
    for (const ev of venue.events) {
      if (!wanted.has(String(ev.id))) continue;
      items.push({
        id: `event-${ev.id}`,
        title: decodeFeedEntities(String(ev.title ?? '')),
        start: String(ev.start ?? ''),
        end: String(ev.end ?? ''),
        location: decodeFeedEntities(String(venue.title ?? '')),
        ...(typeof ev.url === 'string' ? { url: ev.url } : {}),
      });
    }
  }
  return items;
};

// ── Central schedule mirror (scheduled lane) ─────────────────────────────────
// The schedule is fetched server-side and mirrored into public, world-readable
// `scheduleitem` docs (one per event, stable _id). The tick upserts ONLY entries
// whose content changed and deletes events that vanished, so an unchanged
// schedule mints no writes at all.
//
// It used to establish "unchanged" by diffing against the `scheduleitem` docs
// found in the tick's whole-db read. That silently stopped working once the db
// passed the host's 2000-doc query cap: `schedule-event-*` sorts after
// `caltoken-*`, `favorite-*` and `note-*`, so ALL of the mirror fell outside the
// capped window, the diff saw zero existing items, and every tick re-put every
// event — ~330 serialized writes a minute, which pinned this vibe's Durable
// Object at 97% occupancy and left nothing behind them but queueing (a visitor's
// first page load included).
//
// So the mirror remembers what it mirrored itself, in ONE state doc, read BY ID
// (`ctx.db.get`) — no scan, no sort window to fall out of, the same cost on a
// 20-doc db and a 200,000-doc one. It carries a content fingerprint per event id
// — never the schedule itself, which lives in the public docs. (The `_id` leads
// with a digit for historical reasons: that was the old workaround for having no
// keyed read. It is harmless, and renaming it would strand the live doc, so it
// stays — but nothing here reasons about sort order any more.)
//
// The state doc is still backed by an in-isolate copy (see lastFingerprints),
// because "I could not read my state" must never be handled as "nothing is
// mirrored" — the one conclusion that reopens the rewrite loop. Losing both is
// handled as "sync from scratch once per isolate", which is bounded.
export const SCHEDULE_STATE_ID = '0-schedule-sync-state';
export const SCHEDULE_STATE_TYPE = 'schedulesync';

// How often the feed is re-fetched. A festival schedule does not change every 60
// seconds; the 1m value this inherited from the aggregate tick bought nothing and
// cost an egress round-trip a minute. The gate is in-isolate, so a freshly booted
// isolate syncs on its first tick (and, thanks to the state doc, writes nothing
// if the schedule is unchanged).
export const SCHEDULE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastScheduleSyncAt = null;
// Second copy of the state doc's fingerprints, in isolate memory. The durable
// doc is the one that survives an isolate boot; this one survives the durable
// doc going missing from a capped read. Between them, "we have no idea what is
// mirrored" — the belief that re-puts all ~330 events — takes BOTH a lost state
// doc AND a cold isolate, and even then costs one burst rather than one a
// minute. Cheap belt-and-braces on the failure mode that started all this.
let lastFingerprints = null;
export const __resetScheduleSyncForTests = () => {
  lastScheduleSyncAt = null;
  lastFingerprints = null;
};

export const scheduleItemId = (eventId) => `schedule-event-${eventId}`;

// Normalize the raw pickathon.com feed into the exact fields the client renders
// (title/venue entity-decoded, times T-normalized). Mirrors App.jsx's old
// ingestFeed, minus the client-only `day`: the client derives day via
// festivalDayFor at read time, keeping the 4 AM night-cutoff in one place and
// the stored content stable (so the diff below doesn't churn on cutoff logic).
export const ingestScheduleFeed = (data) => {
  const list = [];
  if (data === null || typeof data !== 'object') return list;
  for (const vid in data) {
    const venue = data[vid];
    if (!venue || !Array.isArray(venue.events)) continue;
    for (const ev of venue.events) {
      if (ev == null || ev.id == null) continue;
      const item = {
        eventId: ev.id,
        title: decodeFeedEntities(String(ev.title ?? '')),
        start: ensureT(String(ev.start ?? '')),
        end: ensureT(String(ev.end ?? '')),
        venueTitle: decodeFeedEntities(String(venue.title ?? '')),
        lineup: ev.lineup && typeof ev.lineup === 'object' ? ev.lineup : {},
      };
      if (typeof ev.url === 'string' && ev.url !== '') item.url = ev.url;
      if (venue.color != null) item.venueColor = venue.color;
      list.push(item);
    }
  }
  return list;
};

// Deterministic serialization for content comparison: object keys sorted so a
// re-fetch that reorders lineup keys doesn't read as a change (no timestamp-only
// churn — the doc's content alone decides whether it gets re-put).
const stableStringify = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
      .join(',') +
    '}'
  );
};
const SCHEDULE_CONTENT_KEYS = [
  'eventId',
  'title',
  'start',
  'end',
  'url',
  'venueTitle',
  'venueColor',
  'lineup',
];
// Compare ONLY the content fields — ignores Fireproof metadata (_rev) so a doc
// that merely re-synced isn't seen as changed.
const scheduleContentKey = (d) =>
  stableStringify(SCHEDULE_CONTENT_KEYS.map((k) => (d[k] === undefined ? null : d[k])));

// A compact fingerprint of a content key, so the state doc can hold one entry
// per event without holding the schedule twice: ~330 events × 16 hex chars is
// ~15 KB, where the raw content keys would be ~80 KB and grow with the lineup.
// Two FNV-1a passes with different offset bases, concatenated — 64 bits of
// change detection, no security claim (nobody but the owner can write it).
const fnv1a = (s, seed) => {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const hex8 = (n) => n.toString(16).padStart(8, '0');
export const contentFingerprint = (s) => hex8(fnv1a(s, 0x811c9dc5)) + hex8(fnv1a(s, 0x7fffffff));

// The mirror's memory of what it last wrote: { <scheduleitem _id>: <fingerprint> }.
// Tolerates a missing/legacy/corrupt doc by reading as "nothing mirrored yet",
// which re-puts everything once — the safe direction (the unsafe one would be
// believing docs are mirrored when they aren't).
export const scheduleStateFingerprints = (stateDoc) => {
  const fps = stateDoc && stateDoc.fingerprints;
  return fps !== null && typeof fps === 'object' && !Array.isArray(fps) ? fps : {};
};

// Diff the freshly-fetched feed against the mirror's own state doc — NOT against
// the tick's db read, which is capped and no longer contains the schedule docs.
// Returns the docs to put (new or content-changed), the ids to delete (event
// vanished), and the fingerprint map to persist.
export const diffScheduleAgainstState = (feedItems, stateDoc) => {
  const prev = scheduleStateFingerprints(stateDoc);
  const puts = [];
  const fingerprints = {};
  const seen = new Set();
  for (const it of feedItems) {
    if (it.eventId == null) continue;
    const _id = scheduleItemId(it.eventId);
    if (seen.has(_id)) continue; // a feed that repeats an id → keep the first
    seen.add(_id);
    const doc = { _id, type: 'scheduleitem', ...it };
    const fp = contentFingerprint(scheduleContentKey(doc));
    fingerprints[_id] = fp;
    if (prev[_id] !== fp) puts.push(doc);
  }
  const deletes = [];
  for (const _id of Object.keys(prev)) if (!seen.has(_id)) deletes.push(_id);
  return { puts, deletes, fingerprints };
};

// The scheduled central fetch. At most once per SCHEDULE_SYNC_INTERVAL_MS:
// fetch the feed, diff against the state doc, upsert only the changed docs
// (deleting vanished events), and persist the new state — LAST, so a put that
// throws mid-run leaves the state honest and the next sync retries. Guards: a
// failed OR empty feed leaves existing schedule docs untouched and does not
// advance the cadence gate — never wipe the schedule on a transient upstream
// hiccup (the same rule the old client-side fetch followed). Runs only when
// given a write-capable ctx (admin-mode scheduled lane).
export const syncScheduleDocs = async (event, ctx) => {
  if (!ctx || !ctx.db || typeof ctx.db.put !== 'function') return null;
  const now = Date.parse(event?.scheduledTime) || Date.now();
  if (lastScheduleSyncAt !== null && now - lastScheduleSyncAt < SCHEDULE_SYNC_INTERVAL_MS) {
    return { ok: true, skipped: 'not due' };
  }
  let data;
  try {
    const res = await globalThis.fetch(SCHEDULE_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`schedule feed ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
  const feedItems = ingestScheduleFeed(data);
  if (feedItems.length === 0) return { ok: false, error: 'empty feed' };
  lastScheduleSyncAt = now;
  // The durable state doc first (one keyed read); the in-isolate copy is the
  // backstop for the day it is gone or unreadable. Either way the fallback is
  // "use what this isolate remembers", never "nothing is mirrored".
  let stateDoc = await getDoc(ctx, SCHEDULE_STATE_ID);
  if (!stateDoc && lastFingerprints !== null) {
    console.warn(
      `pickathon tick: ${SCHEDULE_STATE_ID} came back ${stateDoc === undefined ? 'unreadable' : 'empty'} — ` +
        `using the in-isolate copy rather than re-mirroring the whole schedule.`
    );
    stateDoc = { fingerprints: lastFingerprints };
  }
  const { puts, deletes, fingerprints } = diffScheduleAgainstState(feedItems, stateDoc);
  lastFingerprints = fingerprints;
  if (puts.length === 0 && deletes.length === 0) return { ok: true, put: 0, deleted: 0 };
  if (!stateDoc) {
    // First sync of a cold isolate with no durable state to read: legitimate on
    // a brand-new mirror, and the one shape an evicted state doc also takes.
    // Bounded either way — the line above means it can happen once per isolate,
    // not once per tick, which is the whole difference between this and #4293.
    console.warn(
      `pickathon tick: no mirror state found — writing all ${puts.length} schedule docs.`
    );
  }
  for (const doc of puts) await ctx.db.put(doc, { db: 'pickathon' });
  for (const _id of deletes) await ctx.db.delete(_id, { db: 'pickathon' });
  await ctx.db.put(
    {
      _id: SCHEDULE_STATE_ID,
      type: SCHEDULE_STATE_TYPE,
      fingerprints,
      syncedAt: new Date(now).toISOString(),
    },
    { db: 'pickathon' }
  );
  return { ok: true, put: puts.length, deleted: deletes.length };
};

// Stable UID per item so re-importing an updated export replaces events instead
// of duplicating them. The client keys items by doc identity (event-<eventId> /
// shift-<_id>); fall back to title+start for a hand-rolled payload.
const icsUid = (item) => {
  const key = item.id || `${item.title}-${item.start}`;
  return `${key.replace(/[^A-Za-z0-9._-]/g, '-')}@pickathon-picker.vibes.diy`;
};

// items are parseFavesItems output (start/end already in ICS UTC form).
// `now` is injectable for deterministic tests; DTSTAMP is generation time.
// `calName` labels the calendar in subscribing clients (e.g. per-handle feeds).
export const buildFavesCalendar = (items, { now, calName } = {}) => {
  const dtstamp =
    (now ? new Date(now) : new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vibes.diy//pickathon-picker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName || 'My Pickathon Picks')}`,
    `X-WR-TIMEZONE:${FESTIVAL_TZ}`,
    // Subscription refresh hints (Apple/Google honor these where supported).
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  const sorted = [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const item of sorted) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(icsUid(item))}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${item.start}`);
    lines.push(`DTEND:${item.end}`);
    lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
    if (item.location) lines.push(`LOCATION:${escapeIcsText(item.location)}`);
    // URL is URI-valued (RFC 5545 §3.8.4.6), NOT text: backslash-escaping its
    // commas/semicolons would corrupt the link. parseFavesItems guarantees the
    // value has no whitespace/control chars, so verbatim emission is safe.
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
};

const textResponse = (status, message, headers = {}) => new Response(message, { status, headers });

// One-shot download: the client posts its full item list, gets an attachment.
const handleDownload = async (request) => {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return textResponse(400, 'invalid JSON body');
  }
  const parsed = parseFavesItems(payload);
  if (!parsed.ok) return textResponse(400, parsed.error);
  const ics = buildFavesCalendar(parsed.items);
  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="pickathon-faves.ics"',
      'cache-control': 'no-store',
    },
  });
};

// Every subscription response carries this anchor event, so the feed is NEVER
// empty: iOS validates a new subscription by fetching the URL at add time, and
// a valid non-empty calendar always passes — including during the post-deploy
// cold-cache window that used to 503 into "Validation failed". It also gives a
// zero-faves subscriber something better than an apparently-broken empty
// calendar, and it's real festival info.
const ANCHOR_ITEMS = [
  {
    id: 'gates-open-2026',
    title: 'Gates Open',
    start: '2026-07-30T09:00:00',
    end: '2026-07-30T10:00:00',
    location: 'Pendarvis Farm, Happy Valley, OR',
    url: 'https://pickathon.com',
  },
];

// ── Resolving one subscriber, at request time ────────────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const calTokenDocId = (userId) => `caltoken-${userId}`;

// token → the handle it belongs to, or null.
//
// The token is the ONLY capability. `hint` is the `n=` display parameter the
// client already puts in the subscribe URL; it turns the common case into a
// single `ctx.db.get` instead of a paged scan, but it is never trusted: the
// resolved doc's own token has to equal the one presented, so pointing `n=` at
// somebody else's caltoken resolves nothing. A missing, stale or hostile hint
// just falls through to the keyed lookup by `token`.
export const resolveCalToken = async (ctx, token, hint) => {
  if (!ctx || !ctx.db) return null;
  const ok = (doc) =>
    doc && doc.type === 'caltoken' && doc.token === token && doc.userId ? String(doc.userId) : null;
  if (hint) {
    const byId = ok(await getDoc(ctx, calTokenDocId(hint)));
    if (byId !== null) return byId;
  }
  if (typeof ctx.db.query !== 'function') return null;
  let found = null;
  try {
    await readAllPages(ctx, { field: 'token', key: token }, (docs) => {
      for (const d of docs) {
        found = ok(d);
        if (found !== null) return STOP;
      }
    });
  } catch (err) {
    return null;
  }
  return found;
};

// Everything of one user's that may leave the db: favorite event ids, and shifts
// they explicitly marked shareWithFriends. One paged keyed read on `userId`.
//
// Notes come back in this read (they carry a userId too) and are dropped right
// here — the type check below is the privacy boundary, and it is deliberately a
// whitelist: an unknown doc type contributes nothing to a feed.
//
// The handle is matched case-insensitively the way the old aggregate did, by
// asking for both spellings: docs written before handles were normalized carry
// mixed case, and a user whose caltoken says "Alice" still owns "favorite-alice-*".
export const readUserPicks = async (ctx, handle) => {
  const entry = { eventIds: [], shifts: [] };
  if (!ctx || !ctx.db || typeof ctx.db.query !== 'function') return entry;
  const keys = [...new Set([handle, handle.toLowerCase()])];
  try {
    await readAllPages(ctx, { field: 'userId', keys }, (docs) => {
      for (const d of docs) {
        if (!d) continue;
        if (d.type === 'favorite' && d.eventId != null) {
          entry.eventIds.push(String(d.eventId));
        } else if (d.type === 'shift' && d.shareWithFriends) {
          const start = shiftStartOf(d);
          const end = shiftEndOf(d);
          if (start && end)
            entry.shifts.push([
              typeof d.kind === 'string' && d.kind.trim() !== '' ? d.kind.trim() : 'Shift',
              start,
              end,
            ]);
        }
      }
    });
  } catch (err) {
    // A read that fails mid-way leaves a PARTIAL entry, which would silently
    // drop picks. Answer with nothing instead: the response then degrades to the
    // anchor calendar, and the next refresh (minutes away) tries again.
    console.warn(`pickathon feed: picks read failed — ${String((err && err.message) || err)}`);
    return { eventIds: [], shifts: [] };
  }
  entry.eventIds.sort();
  entry.shifts.sort((a, b) => (a[1] < b[1] ? -1 : 1));
  return entry;
};

// Subscription refresh: anonymous GET, authorized by the capability token in the
// URL. Served inline (no attachment) so calendar clients treat it as a feed;
// short shared cache so a popular feed doesn't hammer the schedule join.
const handleSubscription = async (url, ctx) => {
  const t = url.searchParams.get('t') ?? '';
  if (!TOKEN_RE.test(t)) {
    return textResponse(
      400,
      "pass t=<calendar token> — open the app's My Faves tab to get your link"
    );
  }
  // Load shedding (see § Load shedding): 503 + Retry-After, AFTER the token
  // shape check so a genuinely malformed request still gets its 400. A 503 is
  // the one honest answer here — calendar clients back off and keep the events
  // they already synced, where an empty calendar would read as "your picks are
  // gone". Never cached: the shed can lift at any tick.
  if (isSheddingLevel(await readShedLevel(ctx))) {
    return textResponse(
      503,
      'Festival mode: this calendar feed is paused for a little while. Your picks are safe — ' +
        'your calendar will fill back in on its own.',
      { 'retry-after': String(SHED_RETRY_AFTER_SECONDS), 'cache-control': 'no-store' }
    );
  }
  // Display-only label AND the lookup hint: iOS captures the calendar NAME at
  // subscribe time, so a feed that cannot name itself is permanently "@my". The
  // token alone gates data; `n` only labels it (and saves a scan — see
  // resolveCalToken).
  const nRaw = (url.searchParams.get('n') ?? '').toLowerCase();
  const displayName = HANDLE_RE.test(nRaw) ? nRaw : null;
  // A token that resolves to nobody — never minted, revoked, or simply
  // unreadable because this lane could not reach the db — serves the anchor-only
  // calendar rather than an error, so ADDING a subscription always works: iOS
  // renders any add-time failure as "Validation failed". A revoked token
  // converges to the same anchor-only feed as its owner's picks drain away.
  const resolved = await resolveCalToken(ctx, t, displayName);
  const handle = resolved === null ? undefined : resolved.toLowerCase();
  const entry =
    resolved === null ? { eventIds: [], shifts: [] } : await readUserPicks(ctx, resolved);
  let eventItems = [];
  if (entry.eventIds.length > 0) {
    try {
      eventItems = await fetchScheduleItems(entry.eventIds);
    } catch (err) {
      return textResponse(502, 'schedule feed unavailable — try again later');
    }
  }
  const shiftRows = entry.shifts.map((r, i) => ({
    id: `shift-${i}-${r[1]}`,
    title: r[0],
    start: r[1],
    end: r[2],
  }));
  // LENIENT per-item validation: these rows come from the db and the schedule
  // feed — sources the subscriber doesn't control — so a malformed legacy row
  // drops out instead of 400ing the whole feed. A user with no (valid) faves
  // gets the anchor calendar, not an error.
  const items = sanitizeFavesItems([...ANCHOR_ITEMS, ...eventItems, ...shiftRows]).slice(
    0,
    MAX_ITEMS
  );
  return new Response(
    buildFavesCalendar(items, { calName: `@${handle ?? displayName ?? 'my'} — Pickathon Picks` }),
    {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        // An unresolved (anchor-only) response must not linger in any shared
        // cache: the token may be seconds old, or the db momentarily unreadable,
        // and the next request would otherwise be served the placeholder.
        'cache-control': handle ? 'public, max-age=300' : 'no-store',
      },
    }
  );
};

// The `_api` request arrives prefix-stripped (…/_api/faves.ics → /faves.ics).
export async function fetch(request, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== '/faves.ics') {
    return textResponse(
      404,
      'not found — /faves.ics (POST to download, GET ?t=<token> to subscribe)'
    );
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return handleSubscription(url, ctx);
  }
  if (request.method !== 'POST') {
    return textResponse(405, 'method not allowed — GET a subscription or POST schedule items', {
      allow: 'GET, POST',
    });
  }
  return handleDownload(request);
}

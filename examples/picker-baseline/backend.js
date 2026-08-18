// Pickathon Picker backend: serve faves schedules as .ics.
//
// POST /_api/faves.ics  { items: [{ id, title, start, end, location?, url? }] }
//   → 200 text/calendar attachment (<slug>-faves.ics) — one-shot download of
//   whatever the client sends (works for anonymous local-only faves too).
// GET  /_api/faves.ics?t=<token>
//   → 200 text/calendar — the SUBSCRIPTION lane (webcal://). The token is a
//   per-user RANDOM CAPABILITY (a `caltoken` doc, auto-minted client-side the
//   first time the user opens their schedule tab — opt-in: no visit, no token,
//   no feed). Unlike the earlier handle-keyed URL it is unguessable
//   (a handle in the URL invited swapping in someone else's), shareable on
//   purpose, and revocable (delete the doc; the feed drains). It is still a
//   live feed: new picks flow to every subscriber without re-subscribing, and
//   set times come from the MIRRORED schedule docs the scheduled tick keeps
//   fresh — the GET lane makes NO per-request egress, so the feed no longer
//   depends on the festival's own site being reachable or fast on any refresh.
//
// How the anonymous GET learns a user's favorites: it READS them, per request.
// `config.fetch.unfilteredReads` below declares the festival db on the fetch
// lane, which lifts both the anonymous denial and the access-fn-bound denial
// for this handler — so authorization is this file's job, and the random token
// in the URL is what does it: resolve the token to its `caltoken` doc, then
// read only that one handle's docs. Nothing else is reachable through here.
//
// So the feed is always current, there is no aggregation cache and no cold
// window. An unknown or revoked token serves the never-empty anchor-only
// calendar (see ANCHOR_ITEMS) so ADDING a subscription always validates; a
// transient db read failure 502s, so established subscribers keep
// previously-synced events rather than seeing an empty calendar. A fave whose
// schedule doc the mirror has not captured yet is simply omitted until the next
// tick — that is eventual consistency, not an error.
//
// Privacy: a feed is reachable only through its random token, so nothing is
// exposed to handle-guessing. Notes never leave the db; shifts are included
// only with shareWithFriends; a user without a token has no feed at all.
//
// This file runs ALONE in the backend isolate — no import resolution — so the
// few festival-utils timezone helpers it needs are duplicated here on purpose.

// The `why` is the point of making this a declaration rather than a flag: this
// handler serves a per-user calendar to CALENDAR CLIENTS, which are anonymous
// by construction, and the unguessable per-user capability token in the URL is
// the credential it checks before reading anything.
// ── FESTIVAL CONFIG ──────────────────────────────────────────────────────────
// This isolate resolves NO imports, so these values are duplicated from
// festival-config.js on purpose; festival-config.test.js pins them in sync.
// Instantiating a new festival means editing THIS block and the FEED ADAPTER
// below — nothing else in this file.
export const BACKEND_DB = 'examplefest';
export const FESTIVAL_NAME = 'Example Fest';
export const ICS_SLUG = 'example-fest-2026';
// One URL, fetched through platform egress on the scheduled lane — so a feed
// with no CORS header (most festival sites) is fine here even though the client
// could never fetch it directly. If the site is unreachable from the worker too,
// the same mirror runs off an owner-written snapshot doc instead; the read path
// downstream does not change either way.
export const SCHEDULE_URL = 'https://example.com/schedule.json';
const SCHEDULE_ACCEPT = 'application/json';
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  scheduled: { interval: '1m' },
  fetch: {
    unfilteredReads: {
      // A STRING LITERAL, not BACKEND_DB: the platform validates this
      // declaration statically at push time and rejects a computed value.
      // festival-config.test.js pins it equal to BACKEND_DB.
      dbs: ['examplefest'],
      why: "anonymous calendar clients refresh /faves.ics with an unguessable per-user capability token; the handler resolves that token to one handle and reads only that handle's docs",
    },
  },
};

const FESTIVAL_TZ = 'America/Los_Angeles'; // keep in sync with festival-config.js `tz`

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

// LENIENT, per-item — the subscription lane. Its rows come from the db and the
// schedule feed, neither of which the subscriber controls,
// so one malformed row (e.g. a legacy shift saved as `<date>T:00`) must drop
// out, not 400 the user's whole feed (Charlie, #3258 review).
export const sanitizeFavesItems = (rows) =>
  rows
    .map((row) => validateFavesItem(row))
    .filter((r) => r.ok)
    .map((r) => r.item);

// ── Subscription (GET) lane ──────────────────────────────────────────────────

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
// A `ctx.db.query` page is capped host-side (2000 docs, ordered by `_id`) and
// hands back a `next` keyset cursor whenever the page came back FULL. Two rules
// this file lives by:
//
//   · loop on `next`, never on emptiness. The filter arms (`field`/`key`/`keys`)
//     are applied AFTER the SQL page, so a page can come back empty and still
//     carry a cursor; stopping on an empty page silently loses everything after
//     it — the exact class of silent wrong answer that made this app's ics feeds
//     lose picks in the first place.
//   · never conclude anything from one page. Every read below either walks to
//     exhaustion or is a point `ctx.db.get`.
const ID_PAGE_LIMIT = 500;
// A walk terminates because `after` is a strictly increasing docId, so this only
// ever fires if that host contract breaks — and then it must be LOUD (the caller
// turns it into a 502), never a quietly truncated answer.
const MAX_PAGES = 40;

// One doc by id, or null. Tolerates a ctx without the read lane (library and
// test callers) so the tick degrades to "no state doc" rather than throwing.
const getDoc = async (ctx, id) =>
  ctx && ctx.db && typeof ctx.db.get === 'function'
    ? await ctx.db.get(id, { db: BACKEND_DB })
    : null;

// ── Load shedding ────────────────────────────────────────────────────────────
// One owner-written config doc (`_id: 0-load-shed`, `level: off|read-only|
// schedule-only` — see loadshed.js, which the client imports and this file
// cannot: the backend isolate resolves no imports, so the id/type are duplicated
// here on purpose and pinned by loadshed.test.js).
//
// What sheds here, and what deliberately does NOT:
//   · the SUBSCRIPTION lane (GET /faves.ics?t=…) answers 503 + Retry-After,
//     BEFORE it reads the db — which is the whole saving now that every refresh
//     does its own reads. Calendar clients back off on a 503 and keep the events
//     they already synced, so this is the one shed with no user-visible damage;
//     an empty calendar would look like "your picks are gone".
//   · the liveness HEARTBEAT still runs. A shed tick is still a tick that ran,
//     and it is the only durable evidence of that (#4305) — losing it during the
//     exact hours we are under load would blind the one alarm we have.
//   · the 5-minute SCHEDULE MIRROR still runs, in BOTH shed levels. Shedding is
//     about viewer-driven amplification (per-viewer reads and per-refresh feed
//     joins), not about a fixed-cost job that runs 12 times an hour regardless of
//     traffic — and the schedule staying fresh is the whole reason to stay up.
//
// The level is remembered in the isolate as well as read from the doc, and a
// MISSING doc keeps the remembered level rather than lifting the shed: the read
// is a point `ctx.db.get` now, so absence is genuine, but lifting a shed by
// deletion is still the wrong default — it would re-open the load spike the
// switch was flipped for on whatever isolate happened to read first. To turn
// shedding OFF, put `level: "off"`; do not delete the doc.
// A cold isolate that has never seen the doc fails OPEN: the GET lane serves off
// the level the tick last read, so normal service is the only safe default.
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

// Remember the level the tick just read (a point `ctx.db.get`; `null` = no doc).
export const readShedLevel = (doc) => {
  if (doc) {
    shedLevel = parseShedLevel(doc);
    return shedLevel;
  }
  if (shedLevel !== null && shedLevel !== SHED_OFF) {
    console.warn(
      `schedule tick: ${LOADSHED_ID} not found — keeping the in-isolate level ` +
        `"${shedLevel}". Put level:"off" to lift shedding; deleting the doc does not.`
    );
    return shedLevel;
  }
  shedLevel = shedLevel ?? SHED_OFF;
  return shedLevel;
};

// Whether a level pauses writes/viewer amplification. `null` (this isolate has
// never seen the doc) and `off` both read as not shedding.
const isSheddingLevel = (level) => level === SHED_READ_ONLY || level === SHED_SCHEDULE_ONLY;
const isShedding = () => isSheddingLevel(shedLevel);

// The 1-minute tick. It no longer aggregates anything — the GET lane reads the
// db itself — so all that is left is three point reads at most: the shed level,
// the liveness heartbeat, and (at most every SCHEDULE_SYNC_INTERVAL_MS) the
// schedule mirror. It writes nothing unless the festival schedule changed, or
// the hourly heartbeat is due.
export async function scheduled(event, ctx) {
  // The GET lane serves its 503 off this remembered level (see § Load shedding),
  // so the tick reads it every time even while shedding.
  readShedLevel(await getDoc(ctx, LOADSHED_ID));
  // Liveness first: if this tick is alive, say so before anything that can fail.
  await writeHeartbeat(event, ctx);
  // Central schedule mirror: refresh the source feed on its own (slower) cadence
  // and upsert only the `scheduleitem` docs whose content changed. Clients read
  // the schedule from these public docs — nobody fetches the feed per-user
  // anymore. It never wipes the schedule on a transient feed failure.
  await syncScheduleDocs(event, ctx);
}

// ── Tick liveness heartbeat (scheduled lane) ─────────────────────────────────
// The `scheduled` alarm has gone silently dead twice on unchanged code, and a
// vibe backend's console output is forwarded NOWHERE (platform #4305) — so the
// ONLY durable, queryable evidence that the tick ran is a WRITE. Roughly hourly
// the tick stamps one doc with the scheduled time it woke at.
//
// Ops read path (platform admin):
//   vibes-diy db get 0-tick-heartbeat --db <dbName> --vibe festival/<slug>
// A stamp older than ~2h means the alarm is dead and the app needs a redeploy
// (nothing else re-arms an app with no other traffic). Treat ~2h of slack as
// normal: the gate below is in-isolate and best-effort, not a promise.
//
// Discipline is the #4293 one. The gate is remembered, never re-derived from a
// scan: an in-isolate timestamp first (so 59 ticks out of 60 cost nothing at
// all), then the doc itself — whichever is newer wins. Only losing BOTH — no
// doc AND a cold isolate — writes a beat immediately, which is the harmless
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
  if (lastBeatAt !== null && now - lastBeatAt < HEARTBEAT_INTERVAL_MS) {
    return { ok: true, skipped: 'not due' };
  }
  const doc = await getDoc(ctx, HEARTBEAT_ID);
  const docAt = doc ? Date.parse(doc.at) : NaN;
  if (Number.isFinite(docAt) && now - docAt < HEARTBEAT_INTERVAL_MS) {
    return { ok: true, skipped: 'not due' };
  }
  const at = new Date(now).toISOString();
  await ctx.db.put({ _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at }, { db: BACKEND_DB });
  lastBeatAt = now;
  return { ok: true, at };
};

// Project the requested event ids into .ics items by reading the MIRRORED
// `scheduleitem` docs the scheduled tick keeps fresh — NOT by egressing to
// the festival's site. This is the whole point of the mirror: the schedule already
// lives in world-readable docs on the fetch lane (config.fetch.unfilteredReads),
// so a per-request live join is pure waste (and, when that site is slow,
// past the subrequest budget → a feed-wide 502).
//
// The read is bounded by the user's favorite count (tens, not the whole
// schedule), so a point `ctx.db.get` per id in parallel is both simplest and
// cheapest — no cursor to walk. A MISSING doc (an event the mirror hasn't
// captured yet, or has dropped) is silently omitted, the same lenient behavior
// sanitizeFavesItems already applies downstream; a genuine db READ FAILURE
// throws and the caller turns it into a 502 (never an empty "picks gone" feed).
//
// The stored doc carries title/venueTitle already entity-decoded and start/end
// already T-normalized, so no re-decoding here. The .ics item `id` stays
// `event-${eventId}` (the doc's own `_id` is `schedule-event-${eventId}`) so
// UIDs don't change for already-subscribed calendars.
export const fetchScheduleItems = async (ctx, ids) => {
  const uniq = [...new Set(ids.map((id) => String(id)))];
  const docs = await Promise.all(uniq.map((eventId) => getDoc(ctx, scheduleItemId(eventId))));
  const items = [];
  for (let i = 0; i < uniq.length; i++) {
    const doc = docs[i];
    if (!doc) continue; // mirror hasn't captured this fave (yet) → omit it
    const item = {
      id: `event-${uniq[i]}`,
      title: String(doc.title ?? ''),
      start: String(doc.start ?? ''),
      end: String(doc.end ?? ''),
      location: String(doc.venueTitle ?? ''),
    };
    if (typeof doc.url === 'string' && doc.url !== '') item.url = doc.url;
    items.push(item);
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
// found in the tick's whole-db read, which silently stopped working once that
// read hit the host's page cap: the diff saw zero existing items and every tick
// re-put every event — ~330 serialized writes a minute, which pinned this
// vibe's Durable Object at 97% occupancy and left nothing behind them but
// queueing (a visitor's first page load included).
//
// So the mirror remembers what it mirrored itself, in ONE state doc read by id,
// carrying a content fingerprint per event — never the schedule itself, which
// lives in the public docs. (The `0-` id prefix is historical: it was chosen to
// sort ahead of everything else inside a capped whole-db read. The read is a
// point `ctx.db.get` now, so the name carries no meaning — it is kept only
// because renaming a live doc's `_id` is a data migration, not a refactor.)
//
// The state doc is still backed up by an in-isolate copy (see lastFingerprints),
// and a missing one is handled as "use the copy", never as "nothing is
// mirrored" — the one conclusion that reopens the rewrite loop.
export const SCHEDULE_STATE_ID = '0-schedule-sync-state';
export const SCHEDULE_STATE_TYPE = 'schedulesync';

// How often the feed is re-fetched. A festival schedule does not change every 60
// seconds; the 1m value this inherited from the old aggregation tick bought nothing and
// cost an egress round-trip a minute. The gate is in-isolate, so a freshly booted
// isolate syncs on its first tick (and, thanks to the state doc, writes nothing
// if the schedule is unchanged).
export const SCHEDULE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastScheduleSyncAt = null;
// Second copy of the state doc's fingerprints, in isolate memory. The durable
// doc is the one that survives an isolate boot; this one survives the durable
// doc going missing. Between them, "we have no idea what is mirrored" — the
// belief that re-puts all ~330 events — takes BOTH a lost state doc AND a cold
// isolate, and even then costs one burst rather than one a minute. Cheap
// belt-and-braces on the failure mode that started all this.
let lastFingerprints = null;
export const __resetScheduleSyncForTests = () => {
  lastScheduleSyncAt = null;
  lastFingerprints = null;
};

export const scheduleItemId = (eventId) => `schedule-event-${eventId}`;

// Normalize the raw source feed into the exact fields the client renders
// (title/venue entity-decoded, times T-normalized). Mirrors App.jsx's old
// ingestFeed, minus the client-only `day`: the client derives day via
// festivalDayFor at read time, keeping the 4 AM night-cutoff in one place and
// the stored content stable (so the diff below doesn't churn on cutoff logic).
// ── FEED ADAPTER — replace per festival ──────────────────────────────────────
// The one function that knows the SHAPE of a given festival's published data.
// Input: whatever SCHEDULE_URL returns. Output: a flat array of
//   { eventId, title, start, end, venueTitle, url?, venueColor?, lineup? }
// with `start`/`end` as naive local times in the festival's timezone.
// `eventId` MUST be stable across refetches — a content-hashed id
// (`date|HHMM|stageSlug|titleSlug`) if the source has no id of its own, or every
// refresh orphans everybody's favorites.
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
// a read of the schedule docs themselves. Returns the docs to put (new or content-changed), the ids to delete (event
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
    const res = await globalThis.fetch(SCHEDULE_URL, { headers: { accept: SCHEDULE_ACCEPT } });
    if (!res.ok) throw new Error(`schedule feed ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
  const feedItems = ingestScheduleFeed(data);
  if (feedItems.length === 0) return { ok: false, error: 'empty feed' };
  lastScheduleSyncAt = now;
  // The durable state doc first; the in-isolate copy is the backstop for the day
  // it is gone (deleted, or never written).
  let stateDoc = await getDoc(ctx, SCHEDULE_STATE_ID);
  if (!stateDoc && lastFingerprints !== null) {
    console.warn(
      `schedule tick: ${SCHEDULE_STATE_ID} not found — using the in-isolate copy. ` +
        `If this persists, the mirror's state doc is being deleted under it.`
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
      `schedule tick: no mirror state found — writing all ${puts.length} schedule docs.`
    );
  }
  for (const doc of puts) await ctx.db.put(doc, { db: BACKEND_DB });
  for (const _id of deletes) await ctx.db.delete(_id, { db: BACKEND_DB });
  await ctx.db.put(
    {
      _id: SCHEDULE_STATE_ID,
      type: SCHEDULE_STATE_TYPE,
      fingerprints,
      syncedAt: new Date(now).toISOString(),
    },
    { db: BACKEND_DB }
  );
  return { ok: true, put: puts.length, deleted: deletes.length };
};

// Stable UID per item so re-importing an updated export replaces events instead
// of duplicating them. The client keys items by doc identity (event-<eventId> /
// shift-<_id>); fall back to title+start for a hand-rolled payload.
const icsUid = (item) => {
  const key = item.id || `${item.title}-${item.start}`;
  return `${key.replace(/[^A-Za-z0-9._-]/g, '-')}@${ICS_SLUG}.vibes.diy`;
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
    `PRODID:-//vibes.diy//${ICS_SLUG}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName || `My ${FESTIVAL_NAME} Picks`)}`,
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
      'content-disposition': `attachment; filename="${ICS_SLUG}-faves.ics"`,
      'cache-control': 'no-store',
    },
  });
};

// Every subscription response carries this anchor event, so the feed is NEVER
// empty: iOS validates a new subscription by fetching the URL at add time, and
// a valid non-empty calendar always passes — including for a token this app has
// never seen, which used to 503 into "Validation failed". It also gives a
// zero-faves subscriber something better than an apparently-broken empty
// calendar, and it's real festival info.
// Per festival: the never-empty anchor, so ADDING a subscription always
// validates even before the subscriber has picked anything. Gate-opening time is
// the natural one — it belongs on everybody's calendar anyway.
const ANCHOR_ITEMS = [
  {
    id: 'gates-open-2026',
    title: 'Gates Open',
    start: '2026-09-18T11:30:00',
    end: '2026-09-18T12:30:00',
    location: 'Somewhere, ST',
    url: 'https://example.com',
  },
];

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CALTOKEN_PREFIX = 'caltoken-';

// Token → the handle that owns it, or null.
//
// The `caltoken-*` docs form one contiguous block in `_id` order, and the keyset
// cursor is the way to read exactly that block: `after` starts AT the prefix
// (every id carrying it sorts strictly after it), and the first id that does NOT
// carry the prefix is past the whole block — any string greater than the prefix
// but not starting with it sorts after every string that does. So this reads the
// opted-in users and stops, rather than the db.
//
// Deliberately NOT a `field: 'token'` query: filter arms are applied after the
// SQL page, so a keyed query returns a small answer but still pages over every
// doc in the db to find it.
const resolveTokenHandle = async (ctx, token) => {
  let after = CALTOKEN_PREFIX;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await ctx.db.query({ db: BACKEND_DB, limit: ID_PAGE_LIMIT, after });
    for (const d of rows) {
      if (!d || typeof d._id !== 'string' || !d._id.startsWith(CALTOKEN_PREFIX)) return null;
      if (d.type !== 'caltoken' || d.userId == null) continue;
      if (typeof d.token === 'string' && TOKEN_RE.test(d.token) && d.token === token) {
        return String(d.userId);
      }
    }
    // The cursor, never the page length: a page with no cursor is the last one.
    after = rows.next;
    if (after === undefined) return null;
  }
  throw new Error('caltoken scan did not terminate');
};

// Every doc belonging to one handle. Shifts carry uuid `_id`s, so there is no id
// block to walk — this is the keyed read, paged to exhaustion. `keys` covers the
// handle as written and its lower-cased form: the aggregate this replaced folded
// case, and legacy docs may carry either spelling.
const readUserDocs = async (ctx, handle) => {
  const keys = [...new Set([handle, String(handle).toLowerCase()])];
  const out = [];
  let after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await ctx.db.query({ db: BACKEND_DB, field: 'userId', keys, after });
    for (const d of rows) out.push(d);
    // `next`, NOT emptiness: the filter runs after the SQL page, so a page of
    // other users' docs arrives here EMPTY and still carries a cursor.
    after = rows.next;
    if (after === undefined) return out;
  }
  throw new Error('user doc scan did not terminate');
};

// What of a user's docs reaches their calendar: favorite eventIds always (that's
// the feature), shifts only when the user marked them shareWithFriends, notes
// never. Ordering is fixed here (ids ascending, shifts by start) because the
// shift UIDs downstream are positional.
export const feedEntryOf = (docs) => {
  const eventIds = [];
  const shifts = [];
  for (const d of docs) {
    if (!d || !d.userId) continue;
    if (d.type === 'favorite' && d.eventId != null) {
      eventIds.push(String(d.eventId));
    } else if (d.type === 'shift' && d.shareWithFriends) {
      const start = shiftStartOf(d);
      const end = shiftEndOf(d);
      if (start && end)
        shifts.push([
          typeof d.kind === 'string' && d.kind.trim() !== '' ? d.kind.trim() : 'Shift',
          start,
          end,
        ]);
    }
  }
  eventIds.sort();
  shifts.sort((a, b) => (a[1] < b[1] ? -1 : 1));
  return { eventIds, shifts };
};

// Subscription refresh: anonymous GET carrying a capability token. Served inline
// (no attachment) so calendar clients treat it as a feed; short shared cache so a
// popular feed doesn't hammer the reads and the schedule join.
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
  if (isShedding()) {
    return textResponse(
      503,
      'Festival mode: this calendar feed is paused for a little while. Your picks are safe — ' +
        'your calendar will fill back in on its own.',
      { 'retry-after': String(SHED_RETRY_AFTER_SECONDS), 'cache-control': 'no-store' }
    );
  }
  // Display-only label: iOS captures the calendar NAME at subscribe time, so an
  // unresolved token would name the calendar "@my" permanently. The token alone
  // gates data; `n` only labels it.
  const nRaw = (url.searchParams.get('n') ?? '').toLowerCase();
  const displayName = /^[a-z0-9][a-z0-9_-]{0,39}$/.test(nRaw) ? nRaw : null;
  // An unknown token serves the anchor-only calendar rather than an error, so
  // ADDING a subscription always works — iOS renders any add-time failure as
  // "Validation failed". A revoked token converges to the same anchor-only feed.
  //
  // A FAILED read is a different thing entirely and must not land here: "we
  // couldn't read your picks" answered with an empty calendar reads as "your
  // picks are gone", so it 502s below, exactly like a broken schedule feed —
  // calendar clients back off and keep the events they already synced.
  let handle = null;
  let entry = { eventIds: [], shifts: [] };
  try {
    const owner = await resolveTokenHandle(ctx, t);
    if (owner !== null) {
      handle = owner.toLowerCase();
      entry = feedEntryOf(await readUserDocs(ctx, owner));
    }
  } catch (err) {
    return textResponse(502, 'calendar data unavailable — try again later');
  }
  let eventItems = [];
  if (entry.eventIds.length > 0) {
    // Reads the mirrored `scheduleitem` docs — no egress. A missing doc is an
    // omitted fave (handled inside fetchScheduleItems), NOT an error; only a
    // genuine db read failure throws, and that 502s like a broken db read above
    // rather than serving an empty "your picks are gone" calendar.
    try {
      eventItems = await fetchScheduleItems(ctx, entry.eventIds);
    } catch (err) {
      return textResponse(502, 'calendar data unavailable — try again later');
    }
  }
  const shiftRows = entry.shifts.map((r, i) => ({
    id: `shift-${i}-${r[1]}`,
    title: r[0],
    start: r[1],
    end: r[2],
  }));
  // LENIENT per-item validation: these rows come from the db and the schedule
  // feed — sources the subscriber doesn't control — so a malformed
  // legacy row drops out instead of 400ing the whole feed. A user with no
  // (valid) faves gets an EMPTY calendar, not an error.
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
        // cache — the token it did not recognize may be seconds old.
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

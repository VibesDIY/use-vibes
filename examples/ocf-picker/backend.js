// Oregon Country Fair 2026 Picker backend: proxy the lineup schedule and serve
// faves as .ics.
//
// GET  /_api/schedule.json
//   → 200 application/json — the SCHEDULE PROXY. There is no upstream JSON with
//   times (the WP REST session CPT lacks schedule times — verified); the only
//   source is the server-rendered lineup PAGE (~730 KB of HTML), which ships no
//   CORS header, so the client can never fetch it directly. This route fetches
//   the page, PARSES it (parseLineupHtml below), and serves the parsed session
//   array as JSON. The parsed text is cached in module state for 10 minutes; an
//   upstream failure serves the db snapshot, then the stale copy if one exists
//   (better a slightly old schedule than none), and 502s only when there's
//   nothing cached at all.
// POST /_api/faves.ics  { items: [{ id, title, start, end, location?, url? }] }
//   → 200 text/calendar attachment (ocf2026-faves.ics) — one-shot download of
//   whatever the client sends (works for anonymous local-only faves too).
// GET  /_api/faves.ics?t=<token>
//   → 200 text/calendar — the SUBSCRIPTION lane (webcal://). The token is a
//   per-user RANDOM CAPABILITY (a `caltoken` doc, auto-minted client-side the
//   first time the user opens their schedule tab — opt-in: no visit, no token,
//   no ics aggregate). Unlike a handle-keyed URL it is unguessable (a handle in
//   the URL invites swapping in someone else's), shareable on purpose, and
//   revocable (delete the doc; the feed drains). It is still a live feed: new
//   picks flow to every subscriber without re-subscribing, and set times come
//   from a join against the parsed schedule (through the same 10-minute cache
//   the proxy uses — one upstream fetch serves both lanes).
//
// How the anonymous GET learns a user's favorites: it can't read the db —
// ctx.db.query denies anonymous callers outright, and denies access-fn-bound
// dbs on the user-triggerable `fetch` lane regardless (backend-db-callback.ts,
// #3085). The one lane that CAN read the "ocf2026" db is `scheduled` (runs
// as the owner in admin mode), so a 1-minute tick aggregates
// handle → {favorite eventIds, friend-shared shifts} into module state, and
// the GET serves from that in-isolate cache. All three handlers share one
// isolate per vibe, so the cache is visible across lanes; after an isolate
// eviction the next tick (≤1m) repopulates it. Until then the GET serves the
// never-empty anchor-only calendar (see ANCHOR_ITEMS) so ADDING a subscription
// always validates; a transient feed failure still 502s so established
// subscribers keep previously-synced events.
//
// Privacy: a feed is reachable only through its random token, so nothing is
// exposed to handle-guessing. Notes never leave the db; shifts are included
// only with shareWithFriends; users without a token have no aggregate at all.
//
// This file runs ALONE in the backend isolate — no import resolution — so the
// festival-utils timezone helpers AND the lineup parser it needs are duplicated
// here on purpose.

export const config = { scheduled: { interval: '1m' } };

const FESTIVAL_TZ = 'America/Los_Angeles';

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
const ensureT = (s = '') => (s.includes('T') ? s : s.replace(' ', 'T'));

// Same offset trick as festival-utils.js: format the instant in the fair's
// zone, re-read it as if it were UTC, and the difference is the zone offset.
// Handles DST correctly for any date (the fair is PDT, but don't hardcode -7).
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

// A schedule string (naive fair-local like "2026-07-10T11:00:00", or with an
// explicit offset/Z) → ICS UTC basic format "20260710T180000Z", or null if it
// doesn't parse. UTC-basic strings sort lexicographically, which
// buildFavesCalendar relies on for event ordering.
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
  // the extras form stores both times on the selected fair day, so an
  // overnight shift (22:00 → 01:00) arrives as same-day strings — normalize it
  // to end the next day. (+24h in absolute time; the fair's dates never straddle
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
// aggregate and the parsed schedule, neither of which the subscriber controls,
// so one malformed row (e.g. a legacy shift saved as `<date>T:00`) must drop
// out, not 400 the user's whole feed.
export const sanitizeFavesItems = (rows) =>
  rows
    .map((row) => validateFavesItem(row))
    .filter((r) => r.ok)
    .map((r) => r.item);

// ── The lineup-page parser (duplicated from festival-utils.js — no imports) ──

// The lineup page HTML-entity-encodes titles ("Wren &amp; Juniper"). No DOM in
// the isolate, so decode the named entities the page actually uses plus numeric
// forms in plain JS. Unknown entities pass through as literal text — harmless
// in SUMMARY once TEXT-escaped.
const decodeFeedEntities = (s) => {
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

// The lineup page ships no palette (session genres are bare CSS classes), so
// the genre colors are fixed here. MUST stay in sync with festival-utils.js.
const GENRE_COLORS = {
  music: '#d95931',
  vaudeville: '#ec7955',
  workshop: '#25a48f',
  ambiance: '#cd7f32',
  movement: '#27ae60',
  'spoken-word': '#7a4a8a',
};
const GENRE_DEFAULT_COLOR = '#8a8378';

// One side of a "11:00 AM - 11:30 AM" range. Meridiem is optional here because
// the page ships sloppy starts ("1:15 - 2:00PM") — the caller inherits the
// missing one from the other side.
const _clockRe = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;
const parseClockPart = (s) => {
  const m = _clockRe.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h < 1 || h > 12 || min > 59) return null;
  return { h, min, mer: m[3] ? m[3].toUpperCase() : null };
};
// 12-hour clock → minutes since midnight. 12 AM is 00:xx, 12 PM is 12:xx.
const clockMinutes = ({ h, min }, mer) => (h % 12) * 60 + min + (mer === 'PM' ? 720 : 0);

// "11:00 AM - 11:30 AM" (also "6:00PM - 7:20PM", "1:15 - 2:00PM", and variants
// with stray tabs) → { startMin, endMin }, or null. Same rules as the client
// parser: whitespace normalizes, a missing meridiem inherits the other side's
// (stepping the start back 12h if inheriting puts it after the end), an
// end at/before the start rolls forward (+1h when equal, next day when earlier).
const parseTimeRange = (raw) => {
  const t = String(raw).replace(/\s+/g, ' ').trim();
  const dash = t.indexOf('-');
  if (dash < 0) return null;
  const startPart = parseClockPart(t.slice(0, dash));
  const endPart = parseClockPart(t.slice(dash + 1));
  if (startPart === null || endPart === null) return null;
  if (startPart.mer === null && endPart.mer === null) return null;
  const endMer = endPart.mer ?? startPart.mer;
  const endMin = clockMinutes(endPart, endMer);
  let startMin = clockMinutes(startPart, startPart.mer ?? endMer);
  if (startPart.mer === null && startMin > endMin) startMin -= 720;
  if (startMin < 0) return null;
  let end = endMin;
  if (end === startMin) end += 60;
  else if (end < startMin) end += 24 * 60;
  return { startMin, endMin: end };
};

// Naive fair-local ISO from a calendar date + minutes since midnight. Date.UTC
// is a calendar-arithmetic container only — no timezone conversion here.
const pad2 = (n) => String(n).padStart(2, '0');
const isoAt = (dateStr, minutes) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, 0, minutes));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}T${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}:00`;
};

const titleSlug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const deslug = (slug) =>
  slug
    .split('-')
    .filter((w) => w !== '')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

// Parse the lineup page into the app's session objects — one div per session
// (single-quoted attributes), class tokens = ISO date + zero or more
// cat-<genre> tokens + the stage slug. A row with no date or an unparseable
// time is skipped. eventId is SYNTHETIC (the markup has no ids):
// date|startHHMM|stageSlug|titleSlug — deterministic across refreshes so a
// favorite survives a re-fetch. MUST stay in sync with festival-utils.js.
export const parseLineupHtml = (html) => {
  const sessions = [];
  const blocks = String(html).split("<div class='session ");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const classEnd = block.indexOf("'");
    if (classEnd < 0) continue;
    const tokens = block.slice(0, classEnd).trim().split(/\s+/);
    const date = tokens.find((t) => /^\d{4}-\d{2}-\d{2}$/.test(t));
    if (!date) continue;
    const catSlugs = tokens.filter((t) => t.startsWith('cat-')).map((t) => t.slice(4));
    const stageSlug = tokens.find((t) => t !== date && !t.startsWith('cat-')) || 'unknown-stage';
    const timeM = /<span class='time'>([^<]*)<\/span>/.exec(block);
    const range = timeM ? parseTimeRange(timeM[1]) : null;
    if (range === null) continue;
    const titleM = /<span class='title'>([\s\S]*?)<\/span>/.exec(block);
    const title = titleM ? decodeFeedEntities(titleM[1].replace(/<[^>]*>/g, '')).trim() : '';
    if (title === '') continue;
    const hrefM = /<a href='([^']*)'/.exec(block);
    const url = hrefM && /^https?:\/\//i.test(hrefM[1]) ? hrefM[1] : undefined;
    const locM = /<span class='location[^']*'>([\s\S]*?)<\/span>/.exec(block);
    const locText = locM ? decodeFeedEntities(locM[1].replace(/<[^>]*>/g, '')).trim() : '';
    const genreM = /<span class='genre[^']*'>([\s\S]*?)<\/span>/.exec(block);
    const genreText = genreM ? decodeFeedEntities(genreM[1].replace(/<[^>]*>/g, '')).trim() : '';
    const genreLabel =
      genreText !== ''
        ? genreText
        : catSlugs.length > 0
          ? catSlugs.map(deslug).join(', ')
          : 'Event';
    const colorSlug = catSlugs.find((s) => GENRE_COLORS[s]) ?? catSlugs[0];
    const startHHMM = `${pad2(Math.floor(range.startMin / 60))}:${pad2(range.startMin % 60)}`;
    sessions.push({
      eventId: `${date}|${startHHMM}|${stageSlug}|${titleSlug(title)}`,
      title,
      start: isoAt(date, range.startMin),
      end: isoAt(date, range.endMin),
      ...(url ? { url } : {}),
      venueTitle: locText !== '' ? locText : deslug(stageSlug),
      lineup: { id: genreLabel, color: GENRE_COLORS[colorSlug] || GENRE_DEFAULT_COLOR },
    });
  }
  return sessions;
};

// ── Schedule feed (shared by the proxy route and the subscription lane) ──────

export const SCHEDULE_URL = 'https://www.oregoncountryfair.org/the-event/the-lineup/';

// The PARSED session array as JSON text, cached in module state. 10 minutes
// matches the client's localStorage cache. Caching the parsed JSON (not the
// ~730 KB page HTML) means one parse per TTL and a payload an order of
// magnitude smaller.
const SCHEDULE_TTL_MS = 10 * 60 * 1000;
let scheduleCache = null; // { at, body }
// The db-snapshot fallback, assembled by the scheduled tick from
// `schedule-snapshot` chunk docs. The chunks store the PARSED JSON, written
// owner-side by scripts/refresh-schedule.mjs — the safety net for when the
// lineup page blocks/breaks for the worker egress or its markup shifts under
// the parser.
let dbSnapshot = null; // { at, body }
export const __resetScheduleCacheForTests = () => {
  scheduleCache = null;
  dbSnapshot = null;
};

// One fetch path for both consumers: fresh cache wins, then live
// fetch-and-parse of the lineup page, then the db snapshot from the tick, then
// the stale cache. A fetch that succeeds but parses to ZERO sessions counts as
// a failure (a markup change must fall through to the snapshot, not blank the
// app). Throws only when the upstream fails AND nothing is cached or
// snapshotted — callers turn that into a 502.
// MUST call globalThis.fetch — bare `fetch` here resolves to this module's own
// exported handler, not the global (module scope shadows the isolate global).
const fetchScheduleText = async () => {
  const now = Date.now();
  if (scheduleCache !== null && now - scheduleCache.at < SCHEDULE_TTL_MS) return scheduleCache.body;
  try {
    const res = await globalThis.fetch(SCHEDULE_URL, { headers: { accept: 'text/html' } });
    if (!res.ok) throw new Error(`lineup page ${res.status}`);
    const sessions = parseLineupHtml(await res.text());
    if (sessions.length === 0) throw new Error('lineup parse produced no sessions');
    const body = JSON.stringify(sessions);
    scheduleCache = { at: now, body };
    return body;
  } catch (err) {
    if (dbSnapshot !== null) return dbSnapshot.body;
    if (scheduleCache !== null) return scheduleCache.body;
    throw err;
  }
};

// Same-origin schedule proxy: the client can't reach the CORS-less upstream,
// so it fetches this instead. Short shared cache so a page-load burst doesn't
// hammer the upstream between module-cache refreshes.
const handleScheduleProxy = async () => {
  let body;
  try {
    body = await fetchScheduleText();
  } catch (err) {
    // Surface the upstream failure — this proxy is the app's only data path,
    // so a bare 502 with no cause makes egress problems undiagnosable.
    return textResponse(
      502,
      `schedule feed unavailable — try again later (${err && err.message ? err.message : 'unknown error'})`
    );
  }
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
};

// ── Subscription (GET) lane ──────────────────────────────────────────────────

// Fair day → calendar date, for legacy shift docs stored without absolute
// start/end (they carry day + startTime/endTime only). Mirrors FESTIVAL_2026.
const FESTIVAL_DATES = {
  Friday: '2026-07-10',
  Saturday: '2026-07-11',
  Sunday: '2026-07-12',
};

// The cross-lane cache: written by `scheduled` (the only lane that may read
// the access-fn-bound db), read by anonymous GETs. Null until the first tick
// after isolate boot — the GET serves the anchor-only calendar then, never an
// error.
let subCache = null;
export const __resetSubCacheForTests = () => {
  subCache = null;
};

const shiftStartOf = (s) =>
  s.start ??
  (FESTIVAL_DATES[s.day] && s.startTime ? `${FESTIVAL_DATES[s.day]}T${s.startTime}:00` : null);
const shiftEndOf = (s) =>
  s.end ?? (FESTIVAL_DATES[s.day] && s.endTime ? `${FESTIVAL_DATES[s.day]}T${s.endTime}:00` : null);

// 1-minute aggregation tick (tiny db; a short interval keeps the post-deploy/post-eviction cold window — where adding a NEW subscription fails with iOS's "Validation failed" — under a minute). Admin-lane read (unfiltered), so THIS code chooses
// what becomes link-visible: favorite eventIds always (that's the feature),
// shifts only when the user marked them shareWithFriends, notes never.
export async function scheduled(event, ctx) {
  const docs = await ctx.db.query({ db: 'ocf2026' });
  const users = new Map();
  const tokens = new Map();
  const entryFor = (handle) => {
    const key = String(handle).toLowerCase();
    if (!users.has(key)) users.set(key, { eventIds: [], shifts: [] });
    return users.get(key);
  };
  // Assemble the schedule snapshot from its chunk docs (written owner-side by
  // scripts/refresh-schedule.mjs; the chunks carry the PARSED session JSON).
  // Chunks join in seq order, and only a COMPLETE set (all `total` present,
  // one fetchedAt) replaces the previous snapshot — a half-written refresh
  // must not produce truncated JSON.
  // The _id check is defense-in-depth on top of access.js's owner-only rule for
  // this type: only docs at the canonical chunk ids participate, so a stray doc
  // that merely carries the type can never displace a chunk.
  const chunks = docs
    .filter(
      (d) =>
        d &&
        d.type === 'schedule-snapshot' &&
        typeof d.body === 'string' &&
        Number.isInteger(d.seq) &&
        d._id === `schedule-snapshot-${d.seq}`
    )
    .sort((a, b) => a.seq - b.seq);
  if (chunks.length > 0) {
    const total = chunks[0].total;
    const fetchedAt = chunks[0].fetchedAt;
    const complete =
      Number.isInteger(total) &&
      chunks.length === total &&
      chunks.every((c, i) => c.seq === i && c.total === total && c.fetchedAt === fetchedAt);
    if (complete)
      dbSnapshot = {
        at: Date.parse(fetchedAt) || Date.now(),
        body: chunks.map((c) => c.body).join(''),
      };
  }
  for (const d of docs) {
    if (!d || !d.userId) continue;
    if (d.type === 'caltoken') {
      if (typeof d.token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(d.token)) {
        tokens.set(d.token, String(d.userId).toLowerCase());
      }
    } else if (d.type === 'favorite' && d.eventId != null) {
      entryFor(d.userId).eventIds.push(String(d.eventId));
    } else if (d.type === 'shift' && d.shareWithFriends) {
      const start = shiftStartOf(d);
      const end = shiftEndOf(d);
      if (start && end)
        entryFor(d.userId).shifts.push([
          typeof d.kind === 'string' && d.kind.trim() !== '' ? d.kind.trim() : 'Shift',
          start,
          end,
        ]);
    }
  }
  // Opt-in means opt-in: keep aggregates ONLY for handles holding a token —
  // no ics data is built for users who never opened the calendar surface.
  const optedIn = new Set(tokens.values());
  for (const handle of [...users.keys()]) {
    if (!optedIn.has(handle)) users.delete(handle);
  }
  for (const entry of users.values()) {
    entry.eventIds.sort();
    entry.shifts.sort((a, b) => (a[1] < b[1] ? -1 : 1));
  }
  subCache = {
    at: Date.parse(event?.scheduledTime) || Date.now(),
    users,
    tokens,
    truncated: docs.length >= 2000,
  };
}

// Project the requested session ids out of the parsed schedule (through the
// shared cache) into ics-ready items. The sessions are already in the internal
// shape (the proxy serves parsed JSON), so this is a filter + rename:
// location = venueTitle, url passes through, and a missing-or-equal end
// defaults to start + 1h as a belt-and-braces guard (the parser normalizes
// this already).
export const fetchScheduleItems = async (ids) => {
  const wanted = new Set(ids);
  const data = JSON.parse(await fetchScheduleText());
  const items = [];
  if (!Array.isArray(data)) return items;
  for (const s of data) {
    if (!s || !wanted.has(String(s.eventId))) continue;
    const start = String(s.start ?? '');
    let end = String(s.end ?? '');
    const startDate = parseToDate(start);
    if (startDate === null) continue;
    const endDate = parseToDate(end);
    if (endDate === null || endDate.getTime() === startDate.getTime()) {
      end = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
    }
    items.push({
      id: `event-${s.eventId}`,
      title: String(s.title ?? ''),
      start,
      end,
      location: String(s.venueTitle ?? ''),
      ...(typeof s.url === 'string' && /^https?:\/\//i.test(s.url) ? { url: s.url } : {}),
    });
  }
  return items;
};

// Stable UID per item so re-importing an updated export replaces events instead
// of duplicating them. The client keys items by doc identity (event-<eventId> /
// shift-<_id>); fall back to title+start for a hand-rolled payload. Synthetic
// eventIds carry `|` separators — the character strip below keeps UIDs valid.
const icsUid = (item) => {
  const key = item.id || `${item.title}-${item.start}`;
  return `${key.replace(/[^A-Za-z0-9._-]/g, '-')}@ocf-picker.vibes.diy`;
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
    'PRODID:-//vibes.diy//ocf-picker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName || 'My Oregon Country Fair Picks')}`,
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
      'content-disposition': 'attachment; filename="ocf2026-faves.ics"',
      'cache-control': 'no-store',
    },
  });
};

// Every subscription response carries this anchor event, so the feed is NEVER
// empty: iOS validates a new subscription by fetching the URL at add time, and
// a valid non-empty calendar always passes — including during the post-deploy
// cold-cache window that would otherwise 503 into "Validation failed". It also
// gives a zero-faves subscriber something better than an apparently-broken
// empty calendar, and it's real fair info.
const ANCHOR_ITEMS = [
  {
    id: 'ocf2026-opening',
    title: 'Oregon Country Fair',
    start: '2026-07-10T11:00:00',
    end: '2026-07-10T12:00:00',
    location: 'Veneta, Oregon',
    url: 'https://www.oregoncountryfair.org/',
  },
];

// Subscription refresh: anonymous GET keyed by capability token. Served inline
// (no attachment) so calendar clients treat it as a feed; short shared cache so
// a popular feed doesn't hammer the schedule join.
const handleSubscription = async (url) => {
  const t = url.searchParams.get('t') ?? '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    return textResponse(
      400,
      "pass t=<calendar token> — open the app's My Faves tab to get your link"
    );
  }
  // Display-only label: iOS captures the calendar NAME at subscribe time, and
  // a just-minted token often beats the tick — without this the calendar is
  // permanently named "@my". The token alone gates data; `n` labels it.
  const nRaw = (url.searchParams.get('n') ?? '').toLowerCase();
  const displayName = /^[a-z0-9][a-z0-9_-]{0,39}$/.test(nRaw) ? nRaw : null;
  // Cold cache (freshly booted isolate) AND unknown tokens serve the
  // anchor-only calendar rather than an error, so ADDING a subscription always
  // works — a just-minted token can beat the next tick, and iOS renders any
  // add-time failure as "Validation failed". A revoked token converges to the
  // same anchor-only feed. Tradeoff (owner call): a subscriber whose refresh
  // lands in the ≤1m cold window sees anchor-only until their next refresh —
  // rare and self-healing, vs. a guaranteed add-time failure after deploys.
  const cold = subCache === null;
  const handle = cold ? undefined : subCache.tokens.get(t);
  const entry = (handle && subCache.users.get(handle)) || { eventIds: [], shifts: [] };
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
  // LENIENT per-item validation: these rows come from the db aggregate and the
  // parsed schedule — sources the subscriber doesn't control — so a malformed
  // legacy row drops out instead of 400ing the whole feed. A user with no
  // (valid) faves gets an EMPTY calendar, not an error.
  const items = sanitizeFavesItems([...ANCHOR_ITEMS, ...eventItems, ...shiftRows]).slice(
    0,
    MAX_ITEMS
  );
  return new Response(
    buildFavesCalendar(items, {
      calName: `@${handle ?? displayName ?? 'my'} — Oregon Country Fair Picks`,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        // A cold/unresolved (anchor-only) response must not linger in any shared
        // cache past the tick that fills the real data.
        'cache-control': cold || !handle ? 'no-store' : 'public, max-age=300',
      },
    }
  );
};

// The `_api` request arrives prefix-stripped (…/_api/faves.ics → /faves.ics).
export async function fetch(request, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/schedule.json') {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return handleScheduleProxy();
    }
    return textResponse(405, 'method not allowed — GET the schedule', { allow: 'GET' });
  }
  if (url.pathname !== '/faves.ics') {
    return textResponse(
      404,
      'not found — /schedule.json (GET) or /faves.ics (POST to download, GET ?t=<token> to subscribe)'
    );
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return handleSubscription(url);
  }
  if (request.method !== 'POST') {
    return textResponse(405, 'method not allowed — GET a subscription or POST schedule items', {
      allow: 'GET, POST',
    });
  }
  return handleDownload(request);
}

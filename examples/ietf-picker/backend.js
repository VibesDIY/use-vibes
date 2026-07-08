// IETF 126 Agenda Picker backend: serve faves schedules as .ics.
//
// POST /_api/faves.ics  { items: [{ id, title, start, end, location?, url? }] }
//   → 200 text/calendar attachment (ietf126-faves.ics) — one-shot download of
//   whatever the client sends (works for anonymous local-only faves too).
// GET  /_api/faves.ics?t=<token>
//   → 200 text/calendar — the SUBSCRIPTION lane (webcal://). The token is a
//   per-user RANDOM CAPABILITY (a `caltoken` doc, auto-minted client-side the
//   first time the user opens their schedule tab — opt-in: no visit, no token,
//   no ics aggregate). Unlike a handle-keyed URL it is unguessable
//   (a handle in the URL invites swapping in someone else's), shareable on
//   purpose, and revocable (delete the doc; the feed drains). It is still a
//   live feed: new picks flow to every subscriber without re-subscribing, and
//   session times come from a fresh join against the live datatracker agenda
//   feed (platform egress) on every refresh.
//
// How the anonymous GET learns a user's favorites: it can't read the db —
// ctx.db.query denies anonymous callers outright, and denies access-fn-bound
// dbs on the user-triggerable `fetch` lane regardless (backend-db-callback.ts,
// #3085). The one lane that CAN read the "ietf126" db is `scheduled` (runs
// as the owner in admin mode), so a 1-minute tick aggregates
// handle → {favorite session ids, friend-shared shifts} into module state, and
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
// few festival-utils timezone helpers it needs are duplicated here on purpose.

export const config = { scheduled: { interval: '1m' } };

const MEETING_NUMBER = 126;
const MEETING_TZ = 'Europe/Vienna';

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
const ensureT = (s = '') => (s.includes('T') ? s : s.replace(' ', 'T'));

// Same offset trick as festival-utils.js: format the instant in the meeting
// zone, re-read it as if it were UTC, and the difference is the zone offset.
// Handles DST correctly for any date (the meeting is CEST, but don't hardcode +2).
const _offsetFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: MEETING_TZ,
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

// A schedule string (naive Vienna-local like "2026-07-20T13:00:00", or with an
// explicit offset/Z like the agenda feed's) → ICS UTC basic format
// "20260720T110000Z", or null if it doesn't parse. UTC-basic strings sort
// lexicographically, which buildFavesCalendar relies on for event ordering.
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
// loose enough that a maximal real schedule (every session + every shift) fits.
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
  // the extras form stores both times on the selected meeting day, so an
  // overnight entry (22:00 → 01:00) arrives as same-day strings — normalize it
  // to end the next day. (+24h in absolute time; the meeting week never straddles
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
// aggregate and the agenda feed, neither of which the subscriber controls,
// so one malformed row (e.g. a legacy shift saved as `<date>T:00`) must drop
// out, not 400 the user's whole feed (Charlie, #3258 review).
export const sanitizeFavesItems = (rows) =>
  rows
    .map((row) => validateFavesItem(row))
    .filter((r) => r.ok)
    .map((r) => r.item);

// ── Subscription (GET) lane ──────────────────────────────────────────────────

export const SCHEDULE_URL = `https://datatracker.ietf.org/meeting/${MEETING_NUMBER}/agenda.json`;

// Meeting day → calendar date, for legacy shift docs stored without absolute
// start/end (they carry day + startTime/endTime only). Mirrors MEETING_126.
const MEETING_DATES = {
  Saturday: '2026-07-18',
  Sunday: '2026-07-19',
  Monday: '2026-07-20',
  Tuesday: '2026-07-21',
  Wednesday: '2026-07-22',
  Thursday: '2026-07-23',
  Friday: '2026-07-24',
};

// The cross-lane cache: written by `scheduled` (the only lane that may read
// the access-fn-bound db), read by anonymous GETs. Null until the first tick
// after isolate boot — the GET serves the anchor-only calendar then, never an
// error at add time.
let subCache = null;
export const __resetSubCacheForTests = () => {
  subCache = null;
};

const shiftStartOf = (s) =>
  s.start ??
  (MEETING_DATES[s.day] && s.startTime ? `${MEETING_DATES[s.day]}T${s.startTime}:00` : null);
const shiftEndOf = (s) =>
  s.end ?? (MEETING_DATES[s.day] && s.endTime ? `${MEETING_DATES[s.day]}T${s.endTime}:00` : null);

// 1-minute aggregation tick (tiny db; a short interval keeps the post-deploy/post-eviction cold window — where adding a NEW subscription fails with iOS's "Validation failed" — under a minute). Admin-lane read (unfiltered), so THIS code chooses
// what becomes link-visible: favorite session ids always (that's the feature),
// shifts only when the user marked them shareWithFriends, notes never.
export async function scheduled(event, ctx) {
  const docs = await ctx.db.query({ db: 'ietf126' });
  const users = new Map();
  const tokens = new Map();
  const entryFor = (handle) => {
    const key = String(handle).toLowerCase();
    if (!users.has(key)) users.set(key, { eventIds: [], shifts: [] });
    return users.get(key);
  };
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

// Session lengths arrive as "H:MM:SS" (the feed has no end timestamp).
const parseDurationMs = (s) => {
  const m = typeof s === 'string' ? s.match(/^(\d+):([0-5]\d):([0-5]\d)$/) : null;
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 : null;
};
const DEFAULT_SESSION_MS = 60 * 60 * 1000;

// Fetch the live agenda feed and project the requested session ids into items.
// The feed is { "<meeting number>": [assignment, ...] } — sessions share the array
// with room/area records, so the same skip rules as the frontend flatten apply
// (duplicated here on purpose: this file resolves no imports).
// MUST call globalThis.fetch — bare `fetch` here resolves to this module's own
// exported handler, not the global (module scope shadows the isolate global).
export const fetchScheduleItems = async (ids) => {
  const wanted = new Set(ids);
  const res = await globalThis.fetch(SCHEDULE_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`agenda feed ${res.status}`);
  const data = await res.json();
  const items = [];
  for (const key in data) {
    const assignments = data[key];
    if (!Array.isArray(assignments)) continue;
    for (const a of assignments) {
      if (a.objtype !== 'session' || a.status !== 'sched') continue;
      if (!wanted.has(String(a.session_id))) continue;
      const startDate = parseToDate(String(a.start ?? ''));
      if (startDate === null) continue;
      const group = a.group || {};
      items.push({
        id: `event-${a.session_id}`,
        title: String(a.name || group.name || group.acronym || ''),
        start: String(a.start),
        // ISO form (not ICS basic) — validateFavesItem re-parses these rows.
        end: new Date(
          startDate.getTime() + (parseDurationMs(a.duration) ?? DEFAULT_SESSION_MS)
        ).toISOString(),
        location: String(a.location || 'TBA'),
        ...(typeof a.agenda === 'string'
          ? { url: a.agenda }
          : group.acronym
            ? { url: `https://datatracker.ietf.org/group/${group.acronym}/about/` }
            : {}),
      });
    }
  }
  return items;
};

// Stable UID per item so re-importing an updated export replaces events instead
// of duplicating them. The client keys items by doc identity (event-<eventId> /
// shift-<_id>); fall back to title+start for a hand-rolled payload.
const icsUid = (item) => {
  const key = item.id || `${item.title}-${item.start}`;
  return `${key.replace(/[^A-Za-z0-9._-]/g, '-')}@ietf-picker.vibes.diy`;
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
    'PRODID:-//vibes.diy//ietf-picker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName || `My IETF ${MEETING_NUMBER} Picks`)}`,
    `X-WR-TIMEZONE:${MEETING_TZ}`,
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
      'content-disposition': `attachment; filename="ietf${MEETING_NUMBER}-faves.ics"`,
      'cache-control': 'no-store',
    },
  });
};

// Every subscription response carries this anchor event, so the feed is NEVER
// empty: iOS validates a new subscription by fetching the URL at add time, and
// a valid non-empty calendar always passes — including during the post-deploy
// cold-cache window that would otherwise read as "Validation failed". It also
// gives a zero-faves subscriber something better than an apparently-broken
// empty calendar, and it's real meeting info.
const ANCHOR_ITEMS = [
  {
    id: 'ietf126-opening',
    title: 'IETF 126',
    start: '2026-07-18T09:00:00',
    end: '2026-07-18T10:00:00',
    location: 'Vienna, Austria',
    url: 'https://www.ietf.org/meeting/126/',
  },
];

// Subscription refresh: anonymous GET keyed by capability token. Served inline
// (no attachment) so calendar clients treat it as a feed; short shared cache so
// a popular feed doesn't hammer the agenda join.
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
      return textResponse(502, 'agenda feed unavailable — try again later');
    }
  }
  const shiftRows = entry.shifts.map((r, i) => ({
    id: `shift-${i}-${r[1]}`,
    title: r[0],
    start: r[1],
    end: r[2],
  }));
  // LENIENT per-item validation: these rows come from the db aggregate and the
  // agenda feed — sources the subscriber doesn't control — so a malformed
  // legacy row drops out instead of 400ing the whole feed. A user with no
  // (valid) faves gets an EMPTY calendar, not an error.
  const items = sanitizeFavesItems([...ANCHOR_ITEMS, ...eventItems, ...shiftRows]).slice(
    0,
    MAX_ITEMS
  );
  return new Response(
    buildFavesCalendar(items, {
      calName: `@${handle ?? displayName ?? 'my'} — IETF ${MEETING_NUMBER} Picks`,
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
  if (url.pathname !== '/faves.ics') {
    return textResponse(
      404,
      'not found — /faves.ics (POST to download, GET ?t=<token> to subscribe)'
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

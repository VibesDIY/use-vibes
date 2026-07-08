export const FESTIVAL_TZ = 'America/Los_Angeles';

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
export const ensureT = (s = '') => (s.includes('T') ? s : s.replace(' ', 'T'));

// Intl.DateTimeFormat construction is expensive (tens of µs each). These helpers
// run inside sort comparators and filters over hundreds of sessions every render,
// so we build each formatter ONCE at module scope and memoize the results by their
// input string — the fair's date strings are a small, stable set parsed
// thousands of times per render. This is the single biggest render-cost win.
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

const parseInTZ = (naive) => {
  const utcGuess = new Date(naive + 'Z');
  if (isNaN(utcGuess)) return new Date(NaN);
  const offset = tzOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offset * 60000);
};

// Cached: same date string in → same Date out. Callers treat the Date as immutable
// (they read getTime()/compare or build a *new* Date from it), so sharing is safe.
const _dateCache = new Map();
export const toFestivalDate = (s) => {
  if (!s) return new Date(NaN);
  const hit = _dateCache.get(s);
  if (hit) return hit;
  const t = ensureT(s);
  const d = hasExplicitTZ(t) ? new Date(t) : parseInTZ(t);
  _dateCache.set(s, d);
  return d;
};

export const FESTIVAL_2026 = {
  dayOrder: ['Friday', 'Saturday', 'Sunday'],
  dates: {
    Friday: '2026-07-10',
    Saturday: '2026-07-11',
    Sunday: '2026-07-12',
  },
  fallbackStart: '2026-07-10T00:00:00',
};

const _dayPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: FESTIVAL_TZ,
  weekday: 'long',
  hourCycle: 'h23',
  hour: '2-digit',
});
const _weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: FESTIVAL_TZ, weekday: 'long' });
const _dayForCache = new Map();
export const festivalDayFor = (dateStr) => {
  if (_dayForCache.has(dateStr)) return _dayForCache.get(dateStr);
  const d = toFestivalDate(dateStr);
  let out = null;
  if (!isNaN(d)) {
    const parts = Object.fromEntries(_dayPartsFmt.formatToParts(d).map((p) => [p.type, p.value]));
    if (+parts.hour < 4) {
      out = _weekdayFmt.format(new Date(d.getTime() - 24 * 60 * 60 * 1000));
    } else {
      out = parts.weekday;
    }
  }
  _dayForCache.set(dateStr, out);
  return out;
};

// ── The lineup-page parser ───────────────────────────────────────────────────

// The lineup page HTML-entity-encodes titles ("Wren &amp; Juniper",
// "The She&#039;booms"). This parser runs in the browser, in the backend
// isolate, AND in the Node refresher script — no DOM anywhere guaranteed — so
// decode the named entities the page actually uses plus numeric forms in plain
// JS. Unknown entities pass through as literal text.
export const decodeEntities = (s) => {
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

// The lineup page ships no palette (session genres are bare CSS classes), so the
// genre colors are fixed here — saturated hues that tint event cards via the
// --lineup custom prop (see styles.js). Keyed by the page's cat-<slug> tokens.
export const GENRE_COLORS = {
  music: '#d95931',
  vaudeville: '#ec7955',
  workshop: '#25a48f',
  ambiance: '#cd7f32',
  movement: '#27ae60',
  'spoken-word': '#7a4a8a',
};
export const GENRE_DEFAULT_COLOR = '#8a8378';

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
// with stray tabs) → { startMin, endMin } as minutes since midnight, or null if
// either side doesn't parse. Rules, all seen live:
//  - whitespace (incl. tabs INSIDE a time, "1:30\tPM") normalizes to one space
//  - a side missing its meridiem inherits the other side's; if inheriting puts
//    the start after the end, the start steps back 12 hours ("11:30 - 12:30PM"
//    is 11:30 AM, not PM); both sides missing → unparseable
//  - end at/before start rolls forward: equal → +1 hour default (a zero-length
//    session is a data bug, not a real shape), earlier → next day (overnight)
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
// is used only as a calendar-arithmetic container (an endMin ≥ 1440 rolls to
// the next date) — no timezone conversion happens here.
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

// Parse the lineup page (https://www.oregoncountryfair.org/the-event/the-lineup/)
// into the app's session objects. The page is server-rendered WordPress with one
// div per session (single-quoted attributes throughout):
//
//   <div class='session 2026-07-10 cat-vaudeville stage-left '>
//     ... <a href='…/entertainment/jan-luby/'>
//       <span class='time'>11:00 AM - 11:30 AM</span>
//       <span class='title'>Jan Luby</span></a>
//     ... <span class='location column'><i …></i>Stage Left</span>
//         <span class='genre column'><i …></i>Vaudeville</span>
//
// Class tokens: the ISO date, zero or more cat-<genre> tokens (multi-genre
// sessions carry several; the StewardShip stage carries none), and the stage
// slug. A row with no date or an unparseable time can't be placed on the
// schedule and is skipped. eventId is SYNTHETIC (the markup has no ids):
// date|startHHMM|stageSlug|titleSlug — deterministic across refreshes so a
// favorite survives a re-fetch.
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
    const title = titleM ? decodeEntities(titleM[1].replace(/<[^>]*>/g, '')).trim() : '';
    if (title === '') continue;
    const hrefM = /<a href='([^']*)'/.exec(block);
    const url = hrefM && /^https?:\/\//i.test(hrefM[1]) ? hrefM[1] : undefined;
    const locM = /<span class='location[^']*'>([\s\S]*?)<\/span>/.exec(block);
    const locText = locM ? decodeEntities(locM[1].replace(/<[^>]*>/g, '')).trim() : '';
    const genreM = /<span class='genre[^']*'>([\s\S]*?)<\/span>/.exec(block);
    const genreText = genreM ? decodeEntities(genreM[1].replace(/<[^>]*>/g, '')).trim() : '';
    // Display label: the genre span ("Music", "Dance, Movement, Music", …);
    // empty (StewardShip rows) falls back to de-slugged cat tokens, else "Event".
    const genreLabel =
      genreText !== ''
        ? genreText
        : catSlugs.length > 0
          ? catSlugs.map(deslug).join(', ')
          : 'Event';
    // Color: the first cat token with a palette entry (multi-genre rows lead
    // with unmapped tokens like cat-dance), else the first token, else default.
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

// The proxy/snapshot already serve PARSED session objects (backend.js runs the
// same parser), so "flattening" here is just stamping each session with its
// fair day (4 AM night cutoff — festivalDayFor is the same rule the faves and
// friends schedules use). Guard rows minimally: a non-object or one without a
// start can't be placed and drops out.
export const flattenSchedule = (data) => {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (e) =>
        e && typeof e === 'object' && typeof e.start === 'string' && !isNaN(toFestivalDate(e.start))
    )
    .map((e) => ({ ...e, day: festivalDayFor(e.start) }));
};

const _timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: FESTIVAL_TZ,
});
const _dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  timeZone: FESTIVAL_TZ,
});
const _timeCache = new Map();
const _dateStrCache = new Map();
// Guard invalid dates: Intl.DateTimeFormat.format throws RangeError on an invalid
// Date (unlike the old toLocaleTimeString/DateString, which returned "Invalid Date").
// A malformed shift time (e.g. a cleared time input stored as `2026-07-10T:00`) must
// render a safe placeholder, not crash the Extras / My Faves / friend schedule views.
export const fmtTime = (s) => {
  if (_timeCache.has(s)) return _timeCache.get(s);
  const d = toFestivalDate(s);
  const out = isNaN(d) ? '' : _timeFmt.format(d);
  _timeCache.set(s, out);
  return out;
};
export const fmtDate = (s) => {
  if (_dateStrCache.has(s)) return _dateStrCache.get(s);
  const d = toFestivalDate(s);
  const out = isNaN(d) ? '' : _dateFmt.format(d);
  _dateStrCache.set(s, out);
  return out;
};

// What's on right now: started at/before `nowMs` and not yet ended. A set that
// began an hour ago but is still going counts as "now" (end strictly after now).
export const setsOnNow = (events, nowMs) =>
  events.filter((e) => {
    const s = toFestivalDate(e.start).getTime();
    const en = toFestivalDate(e.end).getTime();
    return s <= nowMs && en > nowMs;
  });

// "Up Next" = the next *wave* of sets — the upcoming cluster, anchored on the
// first set that hasn't started yet (NOT on the clock). Anchoring on the next
// set instead of a now+window means the opening wave stays visible even weeks
// before the fair, and at the end of a day it rolls forward to the next
// morning's first acts — while a stage whose next set is a whole wave away still
// drops off. Capped to `perVenue` per stage.
export const upNextSets = (events, nowMs, { waveMs = 2 * 60 * 60 * 1000, perVenue = 2 } = {}) => {
  const upcoming = events
    .filter((e) => toFestivalDate(e.start).getTime() > nowMs)
    .sort((a, b) => toFestivalDate(a.start) - toFestivalDate(b.start));
  if (upcoming.length === 0) return [];
  const horizon = toFestivalDate(upcoming[0].start).getTime() + waveMs;
  const perVenueCount = new Map();
  const out = [];
  for (const e of upcoming) {
    if (toFestivalDate(e.start).getTime() > horizon) break; // past this wave
    const n = perVenueCount.get(e.venueTitle) || 0;
    if (n >= perVenue) continue;
    perVenueCount.set(e.venueTitle, n + 1);
    out.push(e);
  }
  return out; // already sorted by start
};

// Flatten the "My Faves" schedule (favorited sets + extras/shifts) into the
// plain items the backend.js POST /_api/faves.ics endpoint formats. Filtering
// happens HERE, not server-side: the backend validates strictly and 400s the
// whole payload on one bad item, so a stray legacy doc (e.g. a shift stored with
// a malformed "2026-07-10T:00" time) must be dropped before it ever ships.
// shiftStart/shiftEnd are injected because shift time resolution needs App's
// getDateForDay fallback.
export const scheduleIcsItems = ({ events = [], shifts = [], shiftStart, shiftEnd }) => {
  const items = [];
  for (const e of events) {
    // Trim here: the backend trims titles then rejects empties, so a
    // whitespace-only title must be dropped (or trimmed) before it can 400
    // the whole payload.
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (title === '' || isNaN(toFestivalDate(e.start)) || isNaN(toFestivalDate(e.end))) continue;
    const item = { id: `event-${e.eventId}`, title, start: e.start, end: e.end };
    if (e.venueTitle) item.location = e.venueTitle;
    if (e.url) item.url = e.url;
    items.push(item);
  }
  for (const s of shifts) {
    const start = shiftStart(s);
    const end = shiftEnd(s);
    if (isNaN(toFestivalDate(start)) || isNaN(toFestivalDate(end))) continue;
    // Zero-duration shifts are rejected server-side — drop them here so one junk
    // entry can't 400 the whole export. end BEFORE start is kept on purpose: the
    // extras form stores both times on the same fair day, so that's an
    // overnight shift (22:00 → 01:00) and the backend normalizes it to end next day.
    if (toFestivalDate(end).getTime() === toFestivalDate(start).getTime()) continue;
    // Trimmed-or-default: a whitespace-only kind is truthy, so `s.kind || "Shift"`
    // would ship "   " and the backend's trim-then-reject would 400 the export.
    const kind = typeof s.kind === 'string' ? s.kind.trim() : '';
    items.push({ id: `shift-${s._id}`, title: kind === '' ? 'Shift' : kind, start, end });
  }
  return items;
};

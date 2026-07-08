// Swap these two (plus MEETING_126.dates below) and the picker follows the next
// meeting: the feed URL, header text, and datatracker links all key off them.
export const MEETING_NUMBER = 126;
export const MEETING_TZ = 'Europe/Vienna';

export const AGENDA_URL = `https://datatracker.ietf.org/meeting/${MEETING_NUMBER}/agenda.json`;
export const MEETING_URL = `https://www.ietf.org/meeting/${MEETING_NUMBER}/`;

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
export const ensureT = (s = '') => (s.includes('T') ? s : s.replace(' ', 'T'));

// Intl.DateTimeFormat construction is expensive (tens of µs each). These helpers
// run inside sort comparators and filters over hundreds of sessions every render,
// so we build each formatter ONCE at module scope and memoize the results by their
// input string — the agenda's date strings are a small, stable set parsed
// thousands of times per render. This is the single biggest render-cost win.
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

const parseInTZ = (naive) => {
  const utcGuess = new Date(naive + 'Z');
  if (isNaN(utcGuess)) return new Date(NaN);
  const offset = tzOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offset * 60000);
};

// Cached: same date string in → same Date out. Callers treat the Date as immutable
// (they read getTime()/compare or build a *new* Date from it), so sharing is safe.
// The agenda feed stamps explicit UTC ("...Z") times, which parse natively; naive
// strings (extras/shifts) are interpreted as Vienna local.
const _dateCache = new Map();
export const toMeetingDate = (s) => {
  if (!s) return new Date(NaN);
  const hit = _dateCache.get(s);
  if (hit) return hit;
  const t = ensureT(s);
  const d = hasExplicitTZ(t) ? new Date(t) : parseInTZ(t);
  _dateCache.set(s, d);
  return d;
};

export const MEETING_126 = {
  dayOrder: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  dates: {
    Saturday: '2026-07-18',
    Sunday: '2026-07-19',
    Monday: '2026-07-20',
    Tuesday: '2026-07-21',
    Wednesday: '2026-07-22',
    Thursday: '2026-07-23',
    Friday: '2026-07-24',
  },
  fallbackStart: '2026-07-18T00:00:00',
};

const _dayPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: MEETING_TZ,
  weekday: 'long',
  hourCycle: 'h23',
  hour: '2-digit',
});
const _weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: MEETING_TZ, weekday: 'long' });
const _dayForCache = new Map();
// Side meetings and socials can run past midnight, so a session is grouped by the
// *meeting day* it belongs to, not its raw calendar date: anything before 4 AM
// Vienna time counts as the prior day. The faves/friends schedules use the same rule.
export const meetingDayFor = (dateStr) => {
  if (_dayForCache.has(dateStr)) return _dayForCache.get(dateStr);
  const d = toMeetingDate(dateStr);
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

const _timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: MEETING_TZ,
});
const _dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  timeZone: MEETING_TZ,
});
const _timeCache = new Map();
const _dateStrCache = new Map();
// Guard invalid dates: Intl.DateTimeFormat.format throws RangeError on an invalid
// Date (unlike the old toLocaleTimeString/DateString, which returned "Invalid Date").
// A malformed shift time (e.g. a cleared time input stored as `2026-07-20T:00`) must
// render a safe placeholder, not crash the Extras / My Faves / friend schedule views.
export const fmtTime = (s) => {
  if (_timeCache.has(s)) return _timeCache.get(s);
  const d = toMeetingDate(s);
  const out = isNaN(d) ? '' : _timeFmt.format(d);
  _timeCache.set(s, out);
  return out;
};
export const fmtDate = (s) => {
  if (_dateStrCache.has(s)) return _dateStrCache.get(s);
  const d = toMeetingDate(s);
  const out = isNaN(d) ? '' : _dateFmt.format(d);
  _dateStrCache.set(s, out);
  return out;
};

// Datatracker area colors: each session card/chip is tinted by the IETF area (or
// IRTF) its working group belongs to. Groups outside the area tree (teams, admin,
// directorates) fall back to the neutral default.
export const AREA_COLORS = {
  art: '#8e44ad',
  gen: '#566573',
  int: '#2874a6',
  ops: '#1e8449',
  rtg: '#b03a2e',
  sec: '#9a7d0a',
  wit: '#6c3483',
  irtf: '#515a5a',
};
export const DEFAULT_AREA_COLOR = '#34495e';

// Session lengths arrive as "H:MM:SS" (the feed has no end timestamp).
const parseDurationMs = (s) => {
  const m = typeof s === 'string' ? s.match(/^(\d+):([0-5]\d):([0-5]\d)$/) : null;
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 : null;
};
// The datatracker stamps a duration on every scheduled session; if one ever arrives
// blank, a nominal hour keeps the session on the board instead of vanishing.
const DEFAULT_SESSION_MS = 60 * 60 * 1000;

const isoUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// agenda.json is { "<meeting number>": [assignment, ...] } — one flat list where
// sessions share the array with room ("location") and area ("parent") records, and
// session rows can be waiting ("schedw"), rescheduled, or canceled. Only firmly
// scheduled sessions with a parseable start belong on the board.
export const flattenAgenda = (data) => {
  const list = [];
  for (const key in data) {
    const assignments = data[key];
    if (!Array.isArray(assignments)) continue;
    for (const a of assignments) {
      if (a.objtype !== 'session' || a.status !== 'sched') continue;
      const start = toMeetingDate(a.start);
      if (isNaN(start)) continue;
      const group = a.group || {};
      // Working groups hang off an area (`parent`); teams/admin/etc. only carry a
      // `type`. Either way the id labels the chip and picks the tint color.
      const areaId = group.parent || group.type || 'other';
      list.push({
        // session_id is stable across reschedules (the assignment `id` is NOT), so
        // favorites keyed on it survive agenda shuffles.
        eventId: String(a.session_id),
        title: a.name || group.name || group.acronym,
        start: a.start,
        end: isoUtc(start.getTime() + (parseDurationMs(a.duration) ?? DEFAULT_SESSION_MS)),
        // Most sessions have no materials page yet; the group's about page is the
        // stable fallback link.
        url:
          a.agenda ||
          (group.acronym
            ? `https://datatracker.ietf.org/group/${group.acronym}/about/`
            : MEETING_URL),
        venueTitle: a.location || 'TBA',
        acronym: group.acronym,
        groupName: group.name,
        isBof: Boolean(a.is_bof),
        lineup: { id: areaId, color: AREA_COLORS[areaId] || DEFAULT_AREA_COLOR },
        day: meetingDayFor(a.start),
      });
    }
  }
  return list;
};

// What's in session right now: started at/before `nowMs` and not yet ended. A session
// that began an hour ago but is still running counts as "now" (end strictly after now).
export const sessionsOnNow = (events, nowMs) =>
  events.filter((e) => {
    const s = toMeetingDate(e.start).getTime();
    const en = toMeetingDate(e.end).getTime();
    return s <= nowMs && en > nowMs;
  });

// "Up Next" = the next *wave* of sessions — the upcoming block, anchored on the first
// session that hasn't started yet (NOT on the clock). Anchoring on the next session
// instead of a now+window means the opening block stays visible even weeks before the
// meeting, and at the end of a day it rolls forward to the next morning's first
// sessions — while a room whose next session is a whole block away still drops off.
// Capped to `perVenue` per room.
export const upNextSessions = (
  events,
  nowMs,
  { waveMs = 2 * 60 * 60 * 1000, perVenue = 2 } = {}
) => {
  const upcoming = events
    .filter((e) => toMeetingDate(e.start).getTime() > nowMs)
    .sort((a, b) => toMeetingDate(a.start) - toMeetingDate(b.start));
  if (upcoming.length === 0) return [];
  const horizon = toMeetingDate(upcoming[0].start).getTime() + waveMs;
  const perVenueCount = new Map();
  const out = [];
  for (const e of upcoming) {
    if (toMeetingDate(e.start).getTime() > horizon) break; // past this wave
    const n = perVenueCount.get(e.venueTitle) || 0;
    if (n >= perVenue) continue;
    perVenueCount.set(e.venueTitle, n + 1);
    out.push(e);
  }
  return out; // already sorted by start
};

// Flatten the "My Faves" schedule (favorited sessions + extras/shifts) into the plain
// items the backend.js POST /_api/faves.ics endpoint formats. Filtering happens
// HERE, not server-side: the backend validates strictly and 400s the whole payload
// on one bad item, so a stray legacy doc (e.g. a shift stored with a malformed
// "2026-07-20T:00" time) must be dropped before it ever ships. shiftStart/shiftEnd
// are injected because shift time resolution needs App's getDateForDay fallback.
export const scheduleIcsItems = ({ events = [], shifts = [], shiftStart, shiftEnd }) => {
  const items = [];
  for (const e of events) {
    // Trim here: the backend trims titles then rejects empties, so a
    // whitespace-only title must be dropped (or trimmed) before it can 400
    // the whole payload.
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (title === '' || isNaN(toMeetingDate(e.start)) || isNaN(toMeetingDate(e.end))) continue;
    const item = { id: `event-${e.eventId}`, title, start: e.start, end: e.end };
    if (e.venueTitle) item.location = e.venueTitle;
    if (e.url) item.url = e.url;
    items.push(item);
  }
  for (const s of shifts) {
    const start = shiftStart(s);
    const end = shiftEnd(s);
    if (isNaN(toMeetingDate(start)) || isNaN(toMeetingDate(end))) continue;
    // Zero-duration shifts are rejected server-side — drop them here so one junk
    // entry can't 400 the whole export. end BEFORE start is kept on purpose: the
    // extras form stores both times on the same meeting day, so that's an
    // overnight entry (22:00 → 01:00) and the backend normalizes it to end next day.
    if (toMeetingDate(end).getTime() === toMeetingDate(start).getTime()) continue;
    // Trimmed-or-default: a whitespace-only kind is truthy, so `s.kind || "Shift"`
    // would ship "   " and the backend's trim-then-reject would 400 the export.
    const kind = typeof s.kind === 'string' ? s.kind.trim() : '';
    items.push({ id: `shift-${s._id}`, title: kind === '' ? 'Shift' : kind, start, end });
  }
  return items;
};

export const FESTIVAL_TZ = "Europe/Paris";

const hasExplicitTZ = (s) => /([+-]\d\d:\d\d|Z)$/.test(s);
export const ensureT = (s = "") => (s.includes("T") ? s : s.replace(" ", "T"));

// Intl.DateTimeFormat construction is expensive (tens of µs each). These helpers
// run inside sort comparators and filters over hundreds of events every render,
// so we build each formatter ONCE at module scope and memoize the results by their
// input string — the conference's date strings are a small, stable set parsed
// thousands of times per render. This is the single biggest render-cost win.
const _offsetFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: FESTIVAL_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const tzOffsetMinutes = (date) => {
  const p = Object.fromEntries(_offsetFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asIfUTC - date.getTime()) / 60000;
};

const parseInTZ = (naive) => {
  const utcGuess = new Date(naive + "Z");
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
  dayOrder: ["Friday", "Saturday", "Sunday"],
  dates: {
    Friday: "2026-08-28",
    Saturday: "2026-08-29",
    Sunday: "2026-08-30",
  },
  fallbackStart: "2026-08-28T00:00:00",
};

const _dayPartsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: FESTIVAL_TZ,
  weekday: "long",
  hourCycle: "h23",
  hour: "2-digit",
});
const _weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: FESTIVAL_TZ, weekday: "long" });
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

const _timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: FESTIVAL_TZ });
const _dateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: FESTIVAL_TZ,
});
const _timeCache = new Map();
const _dateStrCache = new Map();
// Guard invalid dates: Intl.DateTimeFormat.format throws RangeError on an invalid
// Date (unlike the old toLocaleTimeString/DateString, which returned "Invalid Date").
// A malformed shift time (e.g. a cleared time input stored as `2026-08-28T:00`) must
// render a safe placeholder, not crash the Extras / My Faves / friend schedule views.
export const fmtTime = (s) => {
  if (_timeCache.has(s)) return _timeCache.get(s);
  const d = toFestivalDate(s);
  const out = isNaN(d) ? "" : _timeFmt.format(d);
  _timeCache.set(s, out);
  return out;
};
export const fmtDate = (s) => {
  if (_dateStrCache.has(s)) return _dateStrCache.get(s);
  const d = toFestivalDate(s);
  const out = isNaN(d) ? "" : _dateFmt.format(d);
  _dateStrCache.set(s, out);
  return out;
};

// Map-legend palette for the conference tracks. Each track picks its color by a
// deterministic string hash (FNV-1a — it spreads this year's nine track names
// across five of the six hues) so the assignment is stable across feed refreshes,
// reloads, and clients — no session-local scrambling of the legend.
export const TRACK_COLORS = ["#4c7a34", "#2d6a8f", "#a15c0f", "#6d5a8e", "#1e7d63", "#8f5a4a"];
export const trackColor = (track) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < track.length; i++) {
    h ^= track.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TRACK_COLORS[h % TRACK_COLORS.length];
};

// pretalx duration is "HH:MM" (occasionally "H:MM"); minutes, or null if unparseable.
const durationMinutes = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof s === "string" ? s : "");
  return m ? +m[1] * 60 + +m[2] : null;
};

// Flatten the pretalx/frab schedule export into the internal event list. The feed
// nests events per day per room (schedule.conference.days[].rooms{}); every event
// carries an offset-explicit `date` ("+02:00"), a stable `guid`, and a `duration` —
// `end` is usually present but the duration fallback covers exports that omit it.
// Events whose start (or recoverable end) doesn't parse are skipped: they can't be
// sorted, grouped, or exported. The `day` is the conference day with the 4 AM
// cutoff — an evening social running past midnight still groups under the day it
// started — and it's the same rule the faves/friends schedules already use.
export const flattenPretalx = (data) => {
  const days = data?.schedule?.conference?.days;
  if (!Array.isArray(days)) return [];
  const list = [];
  for (const day of days) {
    const rooms = day?.rooms || {};
    for (const room in rooms) {
      const events = rooms[room];
      if (!Array.isArray(events)) continue;
      for (const e of events) {
        const start = e.date;
        const startDate = toFestivalDate(start);
        if (isNaN(startDate)) continue;
        let end = e.end;
        if (!end || isNaN(toFestivalDate(end))) {
          const mins = durationMinutes(e.duration);
          if (mins === null) continue;
          end = new Date(startDate.getTime() + mins * 60000).toISOString();
        }
        const track = e.track || "General";
        list.push({
          eventId: e.guid,
          title: e.title,
          start,
          end,
          url: e.url,
          venueTitle: room,
          track,
          type: e.type,
          speakers: (e.persons || []).map((p) => p.name).join(", "),
          lineup: { id: track, color: trackColor(track) },
          day: festivalDayFor(start),
        });
      }
    }
  }
  return list;
};

// What's on stage right now: started at/before `nowMs` and not yet ended. A talk that
// began an hour ago but is still running counts as "now" (end strictly after now).
export const setsOnNow = (events, nowMs) =>
  events.filter((e) => {
    const s = toFestivalDate(e.start).getTime();
    const en = toFestivalDate(e.end).getTime();
    return s <= nowMs && en > nowMs;
  });

// "Up Next" = the next *wave* of talks — the upcoming cluster, anchored on the first
// talk that hasn't started yet (NOT on the clock). Anchoring on the next talk instead
// of a now+window means the opening wave stays visible even weeks before the
// conference, and at the end of a day it rolls forward to the next morning's first
// sessions — while a room whose next talk is a whole wave away still drops off.
// Capped to `perVenue` per room.
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

// Flatten the "My Faves" schedule (favorited talks + extras/shifts) into the plain
// items the backend.js POST /_api/faves.ics endpoint formats. Filtering happens
// HERE, not server-side: the backend validates strictly and 400s the whole payload
// on one bad item, so a stray legacy doc (e.g. a shift stored with a malformed
// "2026-08-28T:00" time) must be dropped before it ever ships. shiftStart/shiftEnd
// are injected because shift time resolution needs App's getDateForDay fallback.
export const scheduleIcsItems = ({ events = [], shifts = [], shiftStart, shiftEnd }) => {
  const items = [];
  for (const e of events) {
    // Trim here: the backend trims titles then rejects empties, so a
    // whitespace-only title must be dropped (or trimmed) before it can 400
    // the whole payload.
    const title = typeof e.title === "string" ? e.title.trim() : "";
    if (title === "" || isNaN(toFestivalDate(e.start)) || isNaN(toFestivalDate(e.end))) continue;
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
    // extras form stores both times on the same conference day, so that's an
    // overnight shift (22:00 → 01:00) and the backend normalizes it to end next day.
    if (toFestivalDate(end).getTime() === toFestivalDate(start).getTime()) continue;
    // Trimmed-or-default: a whitespace-only kind is truthy, so `s.kind || "Shift"`
    // would ship "   " and the backend's trim-then-reject would 400 the export.
    const kind = typeof s.kind === "string" ? s.kind.trim() : "";
    items.push({ id: `shift-${s._id}`, title: kind === "" ? "Shift" : kind, start, end });
  }
  return items;
};

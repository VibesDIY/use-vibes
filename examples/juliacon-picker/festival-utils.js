export const FESTIVAL_TZ = "Europe/Berlin";

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
  dayOrder: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  dates: {
    Monday: "2026-08-10",
    Tuesday: "2026-08-11",
    Wednesday: "2026-08-12",
    Thursday: "2026-08-13",
    Friday: "2026-08-14",
    Saturday: "2026-08-15",
  },
  fallbackStart: "2026-08-10T00:00:00",
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
// A malformed shift time (e.g. a cleared time input stored as `2026-08-10T:00`) must
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

// What's on right now: started at/before `nowMs` and not yet ended. A talk that
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
// "2026-08-10T:00" time) must be dropped before it ever ships. shiftStart/shiftEnd
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

// Deterministic track → color mapping over the Julia brand cycle: hash the track
// name, pick from the palette. Same track name always renders the same color —
// across events, renders, and reloads — with no registry to maintain when the
// program adds a track.
export const TRACK_COLORS = ["#389826", "#9558B2", "#CB3C33", "#4063D8", "#2f7d6d", "#a15c0f"];
export const trackColor = (track) => {
  let h = 0;
  for (let i = 0; i < track.length; i++) h = (h * 31 + track.charCodeAt(i)) | 0;
  return TRACK_COLORS[Math.abs(h) % TRACK_COLORS.length];
};

// pretalx/frab schedule.json → the app's flat event list. The shape is shared by
// every pretalx deployment (schedule.conference.days[].rooms is a map of room name
// → event array), so other pretalx-fed pickers can mirror this flattener as-is.
// - eventId is the pretalx `guid` — stable across feed refreshes (numeric `id`
//   is per-instance, `code` is per-submission; guid survives both).
// - `date` is the full ISO start with the venue's UTC offset; `end` is usually
//   present in the same form, and when it isn't we derive it from `duration`
//   ("HH:MM", occasionally "H:MM").
// - Talks are grouped by *conference day* with a 4 AM cutoff (festivalDayFor) —
//   the same window pretalx itself uses (day_start is 04:00), so a post-midnight
//   social lands under the prior day.
const parseDurationMinutes = (duration) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof duration === "string" ? duration : "");
  return m ? +m[1] * 60 + +m[2] : null;
};
export const flattenPretalx = (scheduleJson) => {
  const days = scheduleJson?.schedule?.conference?.days || [];
  const list = [];
  for (const day of days) {
    const rooms = day?.rooms || {};
    for (const roomName in rooms) {
      for (const ev of rooms[roomName] || []) {
        const start = ev.date;
        const startDate = toFestivalDate(start);
        if (isNaN(startDate)) continue; // unparseable start — the event can't be placed, skip it
        // Recover a missing/unparseable end from duration; if neither yields a real
        // time, skip the row — an end-less event would break Now/up-next and the ics
        // export, and the other pretalx pickers skip the same way.
        let end = ev.end && !isNaN(toFestivalDate(ev.end)) ? ev.end : null;
        if (!end) {
          const mins = parseDurationMinutes(ev.duration);
          if (mins != null) end = new Date(startDate.getTime() + mins * 60000).toISOString();
        }
        if (!end) continue;
        const track = ev.track || "General";
        list.push({
          eventId: String(ev.guid),
          title: ev.title,
          start,
          end,
          url: ev.url,
          venueTitle: roomName,
          track,
          type: ev.type,
          speakers: (ev.persons || []).map((p) => p.name).join(", "),
          lineup: { id: track, color: trackColor(track) },
          day: festivalDayFor(start),
        });
      }
    }
  }
  return list;
};

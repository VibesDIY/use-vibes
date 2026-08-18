// Turning docs into the day-by-day schedule the views render. Pure — no React, no db.
import { FESTIVAL_2026, toFestivalDate, festivalDayFor } from './festival-utils.js';

// The stored `scheduleitem` doc deliberately omits `day` (kept out so the server's
// content diff doesn't churn). Derive it at READ time: Pickathon runs late, so a set
// belongs to the festival NIGHT it started in — anything before 4 AM counts as the
// prior day, which is what festivalDayFor applies.
export const eventsFromScheduleDocs = (docs) =>
  docs.map((d) => ({
    eventId: d.eventId,
    title: d.title,
    start: d.start,
    end: d.end,
    url: d.url,
    venueTitle: d.venueTitle,
    venueColor: d.venueColor,
    lineup: d.lineup || {},
    day: festivalDayFor(d.start),
  }));

export const byStart = (a, b) => toFestivalDate(a.start) - toFestivalDate(b.start);

// Prefer the festival day's canonical calendar date. Since a day groups after-midnight
// sets from the *next* calendar date (4 AM cutoff), we must not derive the header date
// from a stray early-morning event's start — hence the canonical table first, an event
// only as a second guess, and the fallbackStart + day index as a last resort.
export const getDateForDay = (day, events = []) => {
  if (FESTIVAL_2026.dates[day]) return FESTIVAL_2026.dates[day];
  const evt = events.find((e) => e.day === day);
  if (evt) return evt.start.split('T')[0];
  const base = new Date(FESTIVAL_2026.fallbackStart);
  const idx = FESTIVAL_2026.dayOrder.indexOf(day);
  const d = new Date(base);
  d.setDate(base.getDate() + Math.max(0, idx));
  return d.toISOString().split('T')[0];
};

// Only days that actually have events or shifts, in festival order. We deliberately do
// NOT seed with the full dayOrder — a festival day with nothing on it (e.g. Monday)
// shouldn't show up in the picker or as an empty section. Unknown days sort last.
export const displayDaysFor = (events, shifts) => {
  const present = new Set([...events.map((e) => e.day), ...shifts.map((s) => s.day)].filter(Boolean));
  const o = FESTIVAL_2026.dayOrder;
  return [...present].sort((a, b) => {
    const ai = o.indexOf(a),
      bi = o.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
};

// One day's rows: picked events + extras, time-ordered. A shift sorts BEFORE an event
// starting at the same minute — you leave for the shift, then catch what's left of the
// set. Callers supply which events/shifts (mine, a followed handle's, a profile's);
// the merge and the ordering are identical for all of them.
export const buildDaySchedule = (day, events, shifts, shiftStartRaw) =>
  [
    ...events
      .filter((e) => festivalDayFor(e.start) === day)
      .map((e) => ({
        type: 'event',
        id: e.eventId,
        title: e.title,
        sort: toFestivalDate(e.start),
        venue: e.venueTitle,
        data: e,
      })),
    ...shifts
      .filter((s) => festivalDayFor(shiftStartRaw(s)) === day)
      .map((s) => ({
        type: 'shift',
        id: s._id,
        sort: toFestivalDate(shiftStartRaw(s)),
        data: s,
      })),
  ].sort((a, b) => a.sort - b.sort || (a.type === 'shift' ? -1 : 1));

// A shift stores its own start/end; the legacy shapes (startISO, or day + startTime)
// are still readable, so resolve in that order.
export const makeShiftBounds = (events) => ({
  shiftStartRaw: (s) => s.start ?? s.startISO ?? `${getDateForDay(s.day, events)}T${s.startTime}:00`,
  shiftEndRaw: (s) => s.end ?? s.endISO ?? `${getDateForDay(s.day, events)}T${s.endTime}:00`,
});

// The day listing reads as time slots, not as a list of timestamps: consecutive rows
// that start at the same minute are one group, and the time is printed ONCE as a label
// above them. That is what makes an overlap legible — two acts at 4 PM are two bubbles
// under one label rather than two cards repeating the same range.
//
// `end` is the group's shared end, and is null when the members disagree — the label
// then shows only the start and each card carries its own "until …" note, because
// printing one range over rows that don't share it would be a lie. Grouping is by
// CONSECUTIVE equal starts on the already-sorted day, so ordering is never disturbed;
// shifts group by exactly the same rule as events.
export const groupByTimeSlot = (items, shiftStartRaw, shiftEndRaw) =>
  groupBySlot(
    items,
    (row) => (row.type === 'shift' ? shiftStartRaw(row.data) : row.data.start),
    (row) => (row.type === 'shift' ? shiftEndRaw(row.data) : row.data.end)
  );

// Same slot rule for a plain event list (the All Events browse day, which has no
// shifts and holds events directly rather than schedule rows).
export const groupEventsByTimeSlot = (events) =>
  groupBySlot(
    events,
    (e) => e.start,
    (e) => e.end
  );

const groupBySlot = (items, startOf, endOf) => {
  const at = (s) => toFestivalDate(s).getTime();
  const groups = [];
  for (const row of items) {
    const start = startOf(row);
    const prev = groups[groups.length - 1];
    if (prev && at(prev.start) === at(start)) prev.rows.push(row);
    else groups.push({ start, rows: [row] });
  }
  return groups.map((g, i) => {
    const ends = g.rows.map(endOf);
    const uniform = ends.every((e) => at(e) === at(ends[0]));
    return { key: `${g.start}-${i}`, start: g.start, end: uniform ? ends[0] : null, items: g.rows };
  });
};

// Parse a QA test-clock string in FESTIVAL time (the same frame every event start is
// parsed in), so `#now=2026-07-31T20:00` means 8 PM on site regardless of the device's
// timezone. Returns null for anything unparseable — a typo must fall back to the real
// clock, never to NaN.
export const parseTestClock = (raw) => {
  if (!raw) return null;
  const ms = toFestivalDate(String(raw).trim()).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// A cold local replica can read EMPTY for a moment even though the server seeded the
// schedule into first paint: the empty first snapshot is treated as authoritative and
// reaps the seeded rows, and the initial pull then puts them back. Anonymous first-timers
// saw the real schedule, then a full-width "downloading" takeover, then the schedule
// again. So a transient empty read is NOT news: keep showing the last non-empty set we
// held this session. Only a session that never had ANY events reads as empty — which is
// what the takeover is actually for. (The platform-side hold on seeded rows is a separate
// fix in flight; this makes the app immune either way.)
export const retainEvents = (current, held) => (current.length > 0 ? current : held);

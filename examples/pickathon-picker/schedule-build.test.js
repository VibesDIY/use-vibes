import { describe, it, expect } from 'vitest';
import { toFestivalDate, setsOnNow, upNextSets } from './festival-utils.js';
import {
  eventsFromScheduleDocs,
  getDateForDay,
  displayDaysFor,
  buildDaySchedule,
  makeShiftBounds,
  byStart,
  groupByTimeSlot,
  groupEventsByTimeSlot,
  parseTestClock,
  retainEvents,
} from './schedule-build.js';

const doc = (over = {}) => ({
  _id: `schedule-event-${over.eventId || 'e1'}`,
  type: 'scheduleitem',
  eventId: 'e1',
  title: 'Band One',
  start: '2026-07-31T20:00:00',
  end: '2026-07-31T21:00:00',
  url: 'https://pickathon.com/e1',
  venueTitle: 'Woods',
  venueColor: '#0f0',
  ...over,
});

const shift = (over = {}) => ({
  _id: 'shift-1',
  type: 'shift',
  day: 'Friday',
  startTime: '09:00',
  endTime: '17:00',
  start: '2026-07-31T09:00:00',
  end: '2026-07-31T17:00:00',
  kind: 'Shift',
  ...over,
});

describe('eventsFromScheduleDocs', () => {
  it('derives `day` at read time (the stored doc omits it)', () => {
    const [e] = eventsFromScheduleDocs([doc()]);
    expect(e.day).toBe('Friday');
    expect(e.eventId).toBe('e1');
    expect(e.lineup).toEqual({});
  });

  it('groups an after-midnight set onto the festival NIGHT it started in', () => {
    const [e] = eventsFromScheduleDocs([doc({ start: '2026-08-01T01:30:00' })]);
    expect(e.day).toBe('Friday');
  });

  it('keeps 4 AM and later on the new day', () => {
    const [e] = eventsFromScheduleDocs([doc({ start: '2026-08-01T04:30:00' })]);
    expect(e.day).toBe('Saturday');
  });

  it('carries the lineup through when present', () => {
    const [e] = eventsFromScheduleDocs([doc({ lineup: { id: 'workshop', color: '#abc' } })]);
    expect(e.lineup).toEqual({ id: 'workshop', color: '#abc' });
  });
});

describe('getDateForDay', () => {
  it('prefers the canonical festival date over any event start', () => {
    const events = eventsFromScheduleDocs([doc({ start: '2026-08-01T01:00:00' })]);
    expect(getDateForDay('Friday', events)).toBe('2026-07-31');
  });

  it('falls back to an event start for a day outside the table', () => {
    const events = [{ day: 'Wednesday', start: '2026-07-29T18:00:00' }];
    expect(getDateForDay('Wednesday', events)).toBe('2026-07-29');
  });

  it('falls back to fallbackStart + day index when nothing else knows', () => {
    expect(getDateForDay('Wednesday', [])).toBe('2026-07-30');
  });
});

describe('displayDaysFor', () => {
  it('lists only days with content, in festival order', () => {
    const events = eventsFromScheduleDocs([
      doc({ eventId: 'a', start: '2026-08-02T12:00:00' }),
      doc({ eventId: 'b', start: '2026-07-30T12:00:00' }),
    ]);
    expect(displayDaysFor(events, [])).toEqual(['Thursday', 'Sunday']);
  });

  it('includes days that only a shift occupies', () => {
    expect(displayDaysFor([], [shift({ day: 'Monday' })])).toEqual(['Monday']);
  });

  it('sorts unknown days last, alphabetically among themselves', () => {
    const events = [{ day: 'Zebra' }, { day: 'Friday' }, { day: 'Aardvark' }];
    expect(displayDaysFor(events, [])).toEqual(['Friday', 'Aardvark', 'Zebra']);
  });

  it('drops days that are absent/undefined', () => {
    expect(displayDaysFor([{ day: undefined }], [])).toEqual([]);
  });
});

describe('buildDaySchedule', () => {
  const { shiftStartRaw } = makeShiftBounds([]);

  it('merges picked events and extras for one day only', () => {
    const events = eventsFromScheduleDocs([
      doc({ eventId: 'fri', start: '2026-07-31T20:00:00' }),
      doc({ eventId: 'sat', start: '2026-08-01T20:00:00' }),
    ]);
    const rows = buildDaySchedule('Friday', events, [shift()], shiftStartRaw);
    expect(rows.map((r) => r.id)).toEqual(['shift-1', 'fri']);
  });

  it('orders by start time', () => {
    const events = eventsFromScheduleDocs([
      doc({ eventId: 'late', start: '2026-07-31T22:00:00' }),
      doc({ eventId: 'early', start: '2026-07-31T18:00:00' }),
    ]);
    expect(buildDaySchedule('Friday', events, [], shiftStartRaw).map((r) => r.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('puts a shift BEFORE an event starting the same minute', () => {
    const events = eventsFromScheduleDocs([doc({ eventId: 'e', start: '2026-07-31T09:00:00' })]);
    const rows = buildDaySchedule('Friday', events, [shift()], shiftStartRaw);
    expect(rows.map((r) => r.type)).toEqual(['shift', 'event']);
  });

  it('shapes event rows with the fields the view reads', () => {
    const events = eventsFromScheduleDocs([doc()]);
    const [row] = buildDaySchedule('Friday', events, [], shiftStartRaw);
    expect(row).toMatchObject({ type: 'event', id: 'e1', title: 'Band One', venue: 'Woods' });
    expect(row.data.eventId).toBe('e1');
  });

  it('is empty for a day with nothing on it', () => {
    expect(buildDaySchedule('Monday', eventsFromScheduleDocs([doc()]), [], shiftStartRaw)).toEqual(
      []
    );
  });

  it('groups an after-midnight pick onto the prior festival night', () => {
    const events = eventsFromScheduleDocs([doc({ eventId: 'late', start: '2026-08-01T01:00:00' })]);
    expect(buildDaySchedule('Friday', events, [], shiftStartRaw).map((r) => r.id)).toEqual(['late']);
  });
});

describe('makeShiftBounds', () => {
  it('prefers the stored start/end', () => {
    const { shiftStartRaw, shiftEndRaw } = makeShiftBounds([]);
    expect(shiftStartRaw(shift())).toBe('2026-07-31T09:00:00');
    expect(shiftEndRaw(shift())).toBe('2026-07-31T17:00:00');
  });

  it('reads the legacy startISO/endISO shape', () => {
    const { shiftStartRaw, shiftEndRaw } = makeShiftBounds([]);
    const legacy = { day: 'Friday', startISO: '2026-07-31T08:00:00', endISO: 'x' };
    expect(shiftStartRaw(legacy)).toBe('2026-07-31T08:00:00');
    expect(shiftEndRaw(legacy)).toBe('x');
  });

  it('composes day + time when neither is stored', () => {
    const { shiftStartRaw } = makeShiftBounds([]);
    expect(shiftStartRaw({ day: 'Saturday', startTime: '10:30' })).toBe('2026-08-01T10:30:00');
  });
});

describe('byStart', () => {
  it('orders two events by festival-local start', () => {
    expect(byStart({ start: '2026-07-31T09:00:00' }, { start: '2026-07-31T10:00:00' })).toBeLessThan(
      0
    );
  });
});

describe('groupByTimeSlot', () => {
  const { shiftStartRaw, shiftEndRaw } = makeShiftBounds([]);
  const group = (rows) => groupByTimeSlot(rows, shiftStartRaw, shiftEndRaw);
  const ev = (id, start, end) => ({
    type: 'event',
    id,
    title: id,
    venue: 'Woods',
    data: { eventId: id, start, end },
  });
  const sh = (id, start, end) => ({ type: 'shift', id, data: { _id: id, start, end } });

  it('is empty for a day with nothing on it', () => {
    expect(group([])).toEqual([]);
  });

  it('makes a singleton group carry its own full range', () => {
    const [g] = group([ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00')]);
    expect(g.start).toBe('2026-07-31T16:00:00');
    expect(g.end).toBe('2026-07-31T17:00:00');
    expect(g.items).toHaveLength(1);
  });

  it('folds two acts sharing a range into ONE labelled slot', () => {
    const groups = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[0].end).toBe('2026-07-31T17:00:00');
  });

  it('drops the shared end when members disagree, so cards can say their own', () => {
    const [g] = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00:00', '2026-07-31T17:30:00'),
    ]);
    expect(g.end).toBe(null);
    expect(g.items).toHaveLength(2);
  });

  it('starts a new group at every new start time', () => {
    const groups = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T18:00:00', '2026-07-31T19:00:00'),
    ]);
    expect(groups.map((g) => g.start)).toEqual([
      '2026-07-31T16:00:00',
      '2026-07-31T18:00:00',
    ]);
  });

  it('groups a shift and an event that start together, by the same rule', () => {
    const [g] = group([
      sh('s1', '2026-07-31T09:00:00', '2026-07-31T17:00:00'),
      ev('a', '2026-07-31T09:00:00', '2026-07-31T17:00:00'),
    ]);
    expect(g.items.map((r) => r.type)).toEqual(['shift', 'event']);
    expect(g.end).toBe('2026-07-31T17:00:00');
  });

  it('reads a shift through the bounds accessors, not its raw fields', () => {
    const legacy = { type: 'shift', id: 's', data: { _id: 's', day: 'Friday', startTime: '09:00', endTime: '17:00' } };
    const [g] = group([legacy]);
    expect(g.start).toBe('2026-07-31T09:00:00');
    expect(g.end).toBe('2026-07-31T17:00:00');
  });

  it('treats equal instants written differently as the same slot', () => {
    const groups = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00', '2026-07-31T17:00'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].end).toBe('2026-07-31T17:00:00');
  });

  it('keeps same-start rows in separate groups when they are not consecutive', () => {
    const groups = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T18:00:00', '2026-07-31T19:00:00'),
      ev('c', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1]);
  });

  it('gives every group a distinct key', () => {
    const groups = group([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T18:00:00', '2026-07-31T19:00:00'),
      ev('c', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
    ]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });
});

describe('parseTestClock', () => {
  it('parses a minute-precision stamp in FESTIVAL time, not device time', () => {
    expect(parseTestClock('2026-07-31T20:00')).toBe(toFestivalDate('2026-07-31T20:00').getTime());
  });

  it('accepts seconds and surrounding whitespace', () => {
    expect(parseTestClock(' 2026-07-31T20:00:00 ')).toBe(parseTestClock('2026-07-31T20:00'));
  });

  it('falls back to the real clock (null) on junk or absence', () => {
    expect(parseTestClock('not-a-time')).toBe(null);
    expect(parseTestClock('')).toBe(null);
    expect(parseTestClock(null)).toBe(null);
  });
});

// The Now tab's selection under a fixed clock — the states a QA screenshot needs to
// distinguish, including the end-of-set boundary and the 4 AM night roll.
describe('now/next selection at a fixed test clock', () => {
  const ev = (venueTitle, start, end) => ({ eventId: `${venueTitle}-${start}`, venueTitle, start, end });
  const events = [
    ev('Woods', '2026-07-31T19:00:00', '2026-07-31T20:00:00'),
    ev('Mtn', '2026-07-31T19:30:00', '2026-07-31T20:30:00'),
    ev('Barn', '2026-07-31T20:15:00', '2026-07-31T21:15:00'),
  ];
  const clock = (s) => parseTestClock(s);

  it('shows both overlapping sets as playing now', () => {
    expect(setsOnNow(events, clock('2026-07-31T19:45')).map((e) => e.venueTitle)).toEqual([
      'Woods',
      'Mtn',
    ]);
  });

  it('drops a set the instant it ends (end is exclusive)', () => {
    expect(setsOnNow(events, clock('2026-07-31T20:00')).map((e) => e.venueTitle)).toEqual(['Mtn']);
  });

  it('counts a set as playing from its exact start', () => {
    expect(setsOnNow(events, clock('2026-07-31T19:00')).map((e) => e.venueTitle)).toEqual(['Woods']);
  });

  it('offers the not-yet-started set as up next', () => {
    expect(upNextSets(events, clock('2026-07-31T19:45')).map((e) => e.venueTitle)).toEqual(['Barn']);
  });

  it('has nothing on stage and nothing next once the night is over', () => {
    expect(setsOnNow(events, clock('2026-08-01T02:00'))).toEqual([]);
    expect(upNextSets(events, clock('2026-08-01T02:00'))).toEqual([]);
  });

  it('still finds the late set from an after-midnight clock (same festival night)', () => {
    const late = [ev('Galaxy', '2026-08-01T01:00:00', '2026-08-01T02:30:00')];
    expect(setsOnNow(late, clock('2026-08-01T01:30')).map((e) => e.venueTitle)).toEqual(['Galaxy']);
  });
});

describe('groupEventsByTimeSlot (All Events browse)', () => {
  const ev = (id, start, end) => ({ eventId: id, title: id, venueTitle: 'V', start, end });

  it('folds a plain event list into slots by the same rule', () => {
    const groups = groupEventsByTimeSlot([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('c', '2026-07-31T18:00:00', '2026-07-31T19:00:00'),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
    expect(groups[0].end).toBe('2026-07-31T17:00:00');
  });

  it('drops the shared end when a slot member runs longer', () => {
    const [g] = groupEventsByTimeSlot([
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00:00', '2026-07-31T17:30:00'),
    ]);
    expect(g.end).toBe(null);
  });

  it('regroups a filtered list without touching order', () => {
    const all = [
      ev('a', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('b', '2026-07-31T16:00:00', '2026-07-31T17:00:00'),
      ev('c', '2026-07-31T18:00:00', '2026-07-31T19:00:00'),
    ];
    const filtered = all.filter((e) => e.eventId !== 'b');
    expect(groupEventsByTimeSlot(filtered).map((g) => g.items.length)).toEqual([1, 1]);
  });

  it('is empty for no events', () => {
    expect(groupEventsByTimeSlot([])).toEqual([]);
  });
});

describe('retainEvents — a transient empty read must not blank the screen', () => {
  const some = [{ eventId: 'a' }];
  const more = [{ eventId: 'a' }, { eventId: 'b' }];

  it('shows the live rows whenever there are any', () => {
    expect(retainEvents(some, [])).toBe(some);
  });

  it('keeps the last non-empty set through a zero-row blip', () => {
    expect(retainEvents([], some)).toBe(some);
  });

  it('prefers fresher live rows over the held ones', () => {
    expect(retainEvents(more, some)).toBe(more);
  });

  it('is empty only when the session never held any events — the honest empty first visit', () => {
    expect(retainEvents([], [])).toEqual([]);
  });
});

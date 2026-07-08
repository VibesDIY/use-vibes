import { describe, it, expect } from 'vitest';
import {
  festivalDayFor,
  setsOnNow,
  upNextSets,
  toFestivalDate,
  scheduleIcsItems,
  flattenPretalx,
  trackColor,
  trackLineup,
} from './festival-utils.js';

// Everything is anchored through toFestivalDate so events and "now" share one frame.
const at = (s) => toFestivalDate(s).getTime();
const ev = (venueTitle, start, end, eventId = `${venueTitle}-${start}`) => ({
  eventId,
  venueTitle,
  start,
  end,
});

describe("festivalDayFor — 4 AM day cutoff (matches the feed's own day windows)", () => {
  it('rolls a 1 AM session back to the previous conference day', () => {
    expect(festivalDayFor('2026-07-21T01:00:00')).toBe('Monday'); // early Tuesday → Monday night
  });
  it('keeps a 5 AM session on its own day', () => {
    expect(festivalDayFor('2026-07-21T05:00:00')).toBe('Tuesday');
  });
  it('treats exactly 4:00 AM as the new day, 3:59 as the old', () => {
    expect(festivalDayFor('2026-07-21T04:00:00')).toBe('Tuesday');
    expect(festivalDayFor('2026-07-21T03:59:00')).toBe('Monday');
  });
  it('leaves a normal late-evening session on its day', () => {
    expect(festivalDayFor('2026-07-20T23:00:00')).toBe('Monday');
  });
  it('maps explicit-offset feed times into the conference zone', () => {
    // The pretalx feed stamps times with +02:00 — same instant, same day.
    expect(festivalDayFor('2026-07-20T09:30:00+02:00')).toBe('Monday');
    expect(festivalDayFor('2026-07-21T03:59:00+02:00')).toBe('Monday');
    // A UTC stamp late on the 20th is already the 21st in Warsaw — but 01:30
    // local is before the 4 AM cutoff, so it still belongs to Monday.
    expect(festivalDayFor('2026-07-20T23:30:00Z')).toBe('Monday');
    expect(festivalDayFor('2026-07-21T07:00:00Z')).toBe('Tuesday');
  });
});

describe('setsOnNow — running right now (started, not yet ended)', () => {
  const now = at('2026-07-21T10:45:00');
  const events = [
    ev('A', '2026-07-21T09:45:00', '2026-07-21T11:15:00'), // started an hour ago, still going
    ev('B', '2026-07-21T09:00:00', '2026-07-21T10:00:00'), // already ended
    ev('C', '2026-07-21T11:00:00', '2026-07-21T12:00:00'), // hasn't started
  ];
  it("includes a talk that started an hour ago but hasn't ended", () => {
    expect(setsOnNow(events, now).map((e) => e.venueTitle)).toEqual(['A']);
  });
});

describe('upNextSets — the next wave (anchored on the next talk, not the clock)', () => {
  const now = at('2026-07-21T10:30:00');
  const events = [
    ev('A', '2026-07-21T10:00:00', '2026-07-21T11:00:00'), // running now
    ev('A', '2026-07-21T11:00:00', '2026-07-21T12:00:00'), // up next #1
    ev('A', '2026-07-21T12:00:00', '2026-07-21T13:00:00'), // up next #2
    ev('A', '2026-07-21T13:30:00', '2026-07-21T14:30:00'), // 3rd — over per-room cap
    ev('B', '2026-07-21T10:30:00', '2026-07-21T11:30:00'), // running now
    ev('B', '2026-07-21T11:30:00', '2026-07-21T12:30:00'), // up next
    ev('C', '2026-07-21T15:30:00', '2026-07-21T16:30:00'), // a wave away — excluded
  ];
  const next = upNextSets(events, now);

  it('caps at two upcoming talks per room', () => {
    const aTimes = next.filter((e) => e.venueTitle === 'A').map((e) => e.start);
    expect(aTimes).toEqual(['2026-07-21T11:00:00', '2026-07-21T12:00:00']); // not the 13:30 one
  });
  it('drops a room whose next talk is a whole wave away', () => {
    // next wave anchors on 11:00 (+2h = 13:00), so C at 15:30 is out.
    expect(next.some((e) => e.venueTitle === 'C')).toBe(false);
  });
  it('never lists a currently-running talk as up next', () => {
    expect(next.some((e) => e.start === '2026-07-21T10:00:00')).toBe(false);
    expect(next.some((e) => e.start === '2026-07-21T10:30:00')).toBe(false);
  });
  it('returns the wave sorted by start', () => {
    expect(next.map((e) => e.start)).toEqual([
      '2026-07-21T11:00:00', // A
      '2026-07-21T11:30:00', // B
      '2026-07-21T12:00:00', // A
    ]);
  });

  // The opening wave is visible even when the conference is weeks out (anchor on
  // the next talk, never on "now").
  it('shows the opening wave a month before the conference', () => {
    const monthBefore = at('2026-06-15T12:00:00');
    const opening = [
      ev('A', '2026-07-20T09:00:00', '2026-07-20T10:00:00'),
      ev('B', '2026-07-20T09:30:00', '2026-07-20T10:30:00'),
      ev('C', '2026-07-20T13:00:00', '2026-07-20T14:00:00'), // later that day — next wave
    ];
    const n = upNextSets(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(['A', 'B']);
    expect(n.some((e) => e.venueTitle === 'C')).toBe(false);
  });

  // At the end of a day, "up next" rolls to the next morning's first sessions.
  it("rolls to the next morning after the day's last talk", () => {
    const lateNight = at('2026-07-21T21:30:00');
    const evs = [
      ev('A', '2026-07-21T19:00:00', '2026-07-21T20:00:00'), // already ended
      ev('D', '2026-07-22T09:00:00', '2026-07-22T10:00:00'), // next morning
      ev('E', '2026-07-22T09:30:00', '2026-07-22T10:30:00'), // next morning
      ev('F', '2026-07-22T14:00:00', '2026-07-22T15:00:00'), // afternoon — next wave
    ];
    const n = upNextSets(evs, lateNight);
    expect(n.map((e) => e.venueTitle)).toEqual(['D', 'E']);
  });
});

// A trimmed slice of the real pretalx export shape: conference.days[] each with a
// rooms map of roomName → [event]. Events carry `guid` (the stable id), `date`
// (ISO with explicit +02:00 offset), usually an ISO `end`, and always a duration.
const FEED = {
  $schema: 'https://c3voc.de/schedule/schema.json',
  schedule: {
    conference: {
      acronym: 'euroscipy-2026',
      title: 'EuroSciPy 2026',
      days: [
        // The opening weekend is listed with empty rooms today — must flatten to nothing.
        { index: 1, date: '2026-07-18', rooms: {} },
        {
          index: 3,
          date: '2026-07-20',
          rooms: {
            'Room 1.38 (Ground Floor, Turing)': [
              {
                guid: 'db53b0b5-568d-5710-abdf-cd0c08b45c9c',
                code: '37RGPY',
                id: 91167,
                date: '2026-07-20T09:30:00+02:00',
                start: '09:30',
                end: '2026-07-20T10:00:00+02:00',
                duration: '00:30',
                room: 'Room 1.38 (Ground Floor, Turing)',
                url: 'https://pretalx.com/euroscipy-2026/talk/37RGPY/',
                title: 'Unravelling the mystery of free threading for scientific computing',
                subtitle: '',
                track: 'Computational Tools and Scientific Python Infrastructure',
                type: 'Talk (25 mins + Q&A)',
                persons: [{ name: 'Ada Speaker' }, { name: 'Grace Coder' }],
              },
              {
                // No ISO `end` — the flattener must derive it from date + duration.
                guid: '0f0f0f0f-1111-2222-3333-444444444444',
                date: '2026-07-20T14:00:00+02:00',
                duration: '01:30',
                room: 'Room 1.38 (Ground Floor, Turing)',
                url: 'https://pretalx.com/euroscipy-2026/talk/TUTOR1/',
                title: 'Hands-on tutorial without an explicit end',
                track: null, // → "General"
                type: 'Tutorial',
                persons: [{ name: 'Nia Tutor' }],
              },
              {
                // Unparseable date — must be skipped, not crash or blank the list.
                guid: 'bad-bad-bad',
                date: 'not-a-date',
                duration: '00:30',
                title: 'Broken row',
                track: 'Computational Tools and Scientific Python Infrastructure',
              },
            ],
            'Room 1.19 (Ground Floor, Shannon)': [
              {
                // After midnight with an explicit offset: 01:00 on the 21st is
                // before the 4 AM cutoff, so it belongs to Monday the 20th.
                guid: '99999999-aaaa-bbbb-cccc-dddddddddddd',
                date: '2026-07-21T01:00:00+02:00',
                end: '2026-07-21T02:00:00+02:00',
                duration: '01:00',
                room: 'Room 1.19 (Ground Floor, Shannon)',
                url: 'https://pretalx.com/euroscipy-2026/talk/NIGHT1/',
                title: 'Late-night community sprint',
                track: 'Tools', // hashes to the yellow palette entry
                type: 'Talk (15 mins + Q&A)',
                persons: [],
              },
            ],
          },
        },
      ],
    },
  },
};

describe('flattenPretalx — the pretalx/frab export becomes the internal event shape', () => {
  const events = flattenPretalx(FEED);
  const byId = Object.fromEntries(events.map((e) => [e.eventId, e]));

  it('flattens days → rooms → events, skipping unparseable rows and empty days', () => {
    expect(events.length).toBe(3); // the broken row is dropped, empty day yields nothing
    expect(byId['bad-bad-bad']).toBeUndefined();
  });

  it('keys events by their stable guid', () => {
    const talk = byId['db53b0b5-568d-5710-abdf-cd0c08b45c9c'];
    expect(talk).toBeDefined();
    expect(talk.title).toBe('Unravelling the mystery of free threading for scientific computing');
    expect(talk.start).toBe('2026-07-20T09:30:00+02:00');
    expect(talk.end).toBe('2026-07-20T10:00:00+02:00');
    expect(talk.venueTitle).toBe('Room 1.38 (Ground Floor, Turing)');
    expect(talk.url).toBe('https://pretalx.com/euroscipy-2026/talk/37RGPY/');
  });

  it('derives a missing end from start + duration', () => {
    const tut = byId['0f0f0f0f-1111-2222-3333-444444444444'];
    expect(tut).toBeDefined();
    // 14:00 +02:00 plus 1h30 — compare instants, not string forms.
    expect(toFestivalDate(tut.end).getTime()).toBe(
      toFestivalDate('2026-07-20T15:30:00+02:00').getTime()
    );
  });

  it('buckets offset-stamped events into conference days with the 4 AM cutoff', () => {
    expect(byId['db53b0b5-568d-5710-abdf-cd0c08b45c9c'].day).toBe('Monday');
    // 01:00 on Tuesday's calendar date rolls back to Monday.
    expect(byId['99999999-aaaa-bbbb-cccc-dddddddddddd'].day).toBe('Monday');
  });

  it('joins speaker names for display under the title', () => {
    expect(byId['db53b0b5-568d-5710-abdf-cd0c08b45c9c'].speakers).toBe('Ada Speaker, Grace Coder');
    expect(byId['99999999-aaaa-bbbb-cccc-dddddddddddd'].speakers).toBe('');
  });

  it('defaults a missing track to General', () => {
    const tut = byId['0f0f0f0f-1111-2222-3333-444444444444'];
    expect(tut.track).toBe('General');
    expect(tut.lineup.id).toBe('General');
  });

  it('colors tracks deterministically, flipping tag text dark on the yellow', () => {
    const night = byId['99999999-aaaa-bbbb-cccc-dddddddddddd'];
    expect(night.lineup.color).toBe('#FFD43B');
    expect(night.lineup.textColor).toBe('#1a1a1a'); // white on the yellow fails contrast
    const talk = byId['db53b0b5-568d-5710-abdf-cd0c08b45c9c'];
    expect(talk.lineup.color).not.toBe('#FFD43B');
    expect(talk.lineup.textColor).toBe('#fff');
    // Same name → same color, every time.
    expect(trackColor('Tools')).toBe('#FFD43B');
    expect(trackColor(night.track)).toBe(night.lineup.color);
    expect(trackLineup('Tools')).toEqual({ id: 'Tools', color: '#FFD43B', textColor: '#1a1a1a' });
  });

  it("returns nothing for a shape that isn't a schedule export", () => {
    expect(flattenPretalx(null)).toEqual([]);
    expect(flattenPretalx({})).toEqual([]);
  });
});

describe('scheduleIcsItems — flattening My Faves for the .ics backend', () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it('maps favorite talks with doc-keyed ids, location, and url', () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: 'db53b0b5-568d-5710-abdf-cd0c08b45c9c',
          title: 'Free Threading in Practice',
          start: '2026-07-20T13:00:00+02:00',
          end: '2026-07-20T14:00:00+02:00',
          venueTitle: 'Room 1.38 (Ground Floor, Turing)',
          url: 'https://pretalx.com/euroscipy-2026/talk/37RGPY/',
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: 'event-db53b0b5-568d-5710-abdf-cd0c08b45c9c',
        title: 'Free Threading in Practice',
        start: '2026-07-20T13:00:00+02:00',
        end: '2026-07-20T14:00:00+02:00',
        location: 'Room 1.38 (Ground Floor, Turing)',
        url: 'https://pretalx.com/euroscipy-2026/talk/37RGPY/',
      },
    ]);
  });

  it('maps shifts through the injected time resolvers, defaulting the kind', () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: 's1', kind: 'Sprint', start: '2026-07-20T09:00:00', end: '2026-07-20T17:00:00' },
        { _id: 's2', start: '2026-07-21T09:00:00', end: '2026-07-21T12:00:00' }, // no kind
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['shift-s1', 'Sprint'],
      ['shift-s2', 'Shift'],
    ]);
  });

  it('trims whitespace-only kinds and titles instead of shipping strings the backend rejects', () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: '1', title: '   ', start: '2026-07-20T13:00:00', end: '2026-07-20T14:00:00' }, // dropped
        {
          eventId: '2',
          title: '  Real Talk  ',
          start: '2026-07-20T13:00:00',
          end: '2026-07-20T14:00:00',
        },
      ],
      shifts: [
        { _id: 's1', kind: '   ', start: '2026-07-20T09:00:00', end: '2026-07-20T17:00:00' },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['event-2', 'Real Talk'],
      ['shift-s1', 'Shift'],
    ]);
  });

  it('drops zero-duration shifts but keeps overnight ones for the backend to normalize', () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: 'zero', kind: 'Shift', start: '2026-07-20T09:00:00', end: '2026-07-20T09:00:00' },
        // Same-day strings with end before start = the extras form's overnight shape.
        {
          _id: 'overnight',
          kind: 'Late sprint',
          start: '2026-07-20T22:00:00',
          end: '2026-07-20T01:00:00',
        },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(['shift-overnight']);
  });

  it('drops entries the backend would reject: malformed times and blank titles', () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: '1', title: '', start: '2026-07-20T13:00:00', end: '2026-07-20T14:00:00' },
      ],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: 'bad', kind: 'Shift', start: '2026-07-20T:00', end: '2026-07-20T17:00:00' },
        { _id: 'ok', kind: 'Shift', start: '2026-07-20T09:00:00', end: '2026-07-20T17:00:00' },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(['shift-ok']);
  });
});

import { describe, it, expect } from 'vitest';
import {
  festivalDayFor,
  setsOnNow,
  upNextSets,
  toFestivalDate,
  flattenSchedule,
  scheduleIcsItems,
} from './festival-utils.js';

// Everything is anchored through toFestivalDate so events and "now" share one frame.
const at = (s) => toFestivalDate(s).getTime();
const ev = (venueTitle, start, end, eventId = `${venueTitle}-${start}`) => ({
  eventId,
  venueTitle,
  start,
  end,
});

// A trimmed slice of the real scheduleDays.json shape: a top-level array of
// { day, sessions }, session times as UTC ISO stamps, the per-track palette on
// tags[0], and contentEntity.links mixing real URLs with fediverse handles.
const FEED_DAYS = [
  {
    day: '2026-08-05',
    sessions: [
      {
        id: 67803,
        title: 'The Unofficial DEF CON Shoot',
        begin: '2026-08-05T18:00:00Z',
        beginIso: '2026-08-05T18:00:00.000Z',
        end: '2026-08-06T00:15:00Z',
        endIso: '2026-08-06T00:15:00.000Z',
        locationName: 'Other / See Description',
        color: '#8F6C5D',
        contentId: 66388,
        contentEntity: {
          title: 'The Unofficial DEF CON Shoot',
          links: [
            {
              label: 'Google Maps',
              type: 'link',
              url: 'https://maps.app.goo.gl/GCpWr55GjQajASA99',
            },
            { label: 'Website', type: 'link', url: 'https://dcshoot.org' },
          ],
        },
        speakers: null,
        session: { timezoneName: 'America/Los_Angeles' },
        tags: [
          { colorBackground: '#8F6C5D', colorForeground: '#ffffff', id: 49749, label: 'Event' },
        ],
      },
    ],
  },
  {
    day: '2026-08-07',
    sessions: [
      // Shipped with end === begin — the flattener must default the end to +1 hour.
      {
        id: 68001,
        title: 'Lockpicking 101',
        beginIso: '2026-08-07T17:00:00.000Z',
        endIso: '2026-08-07T17:00:00.000Z',
        locationName: 'LVCC - L2 - W228 (Workshops)',
        tags: [
          { colorBackground: '#333dd7', colorForeground: '#ffffff', id: 49750, label: 'Workshop' },
        ],
        contentEntity: {
          // A fediverse handle rides in links[].url — not http(s), so no session url.
          links: [{ label: 'Mastodon', type: 'link', url: '@HamRadioVillage@defcon.social' }],
        },
      },
      // No end and no tags at all: +1h default, session color as the track color,
      // and no locationName → "TBA".
      {
        id: 68002,
        title: 'Badge Line Hangout',
        beginIso: '2026-08-07T18:00:00.000Z',
        color: '#123456',
        tags: [],
      },
      // A party running past midnight: 01:30 PDT Saturday belongs to Friday night.
      {
        id: 68003,
        title: 'Hacker Karaoke',
        beginIso: '2026-08-08T08:30:00.000Z',
        endIso: '2026-08-08T10:00:00.000Z',
        locationName: 'LVCC - L2 - Ballroom',
        tags: [
          { colorBackground: '#D56CD0', colorForeground: '#ffffff', id: 49751, label: 'Party' },
        ],
      },
      // The manifest rebuilds daily as content lands; a row without a parseable
      // begin can't be placed on the schedule and must drop out.
      { id: 68004, title: 'TBD Placeholder', locationName: 'TBA' },
    ],
  },
];

describe('flattenSchedule — scheduleDays.json → internal event shape', () => {
  const flat = flattenSchedule(FEED_DAYS);
  const byId = Object.fromEntries(flat.map((e) => [e.eventId, e]));

  it('stringifies session ids and skips rows without a parseable begin', () => {
    expect(flat).toHaveLength(4);
    expect(byId['67803'].eventId).toBe('67803');
    expect(flat.every((e) => typeof e.eventId === 'string')).toBe(true);
    expect(byId['68004']).toBeUndefined();
  });

  it("prefers beginIso/endIso and keeps the feed's UTC stamps", () => {
    expect(byId['67803'].start).toBe('2026-08-05T18:00:00.000Z');
    expect(byId['67803'].end).toBe('2026-08-06T00:15:00.000Z');
  });

  it('defaults a missing or begin-equal end to start + 1 hour', () => {
    expect(byId['68001'].end).toBe('2026-08-07T18:00:00.000Z'); // end === begin
    expect(byId['68002'].end).toBe('2026-08-07T19:00:00.000Z'); // no end at all
  });

  it("passes the feed's per-track palette through (bg + fg), falling back to the session color", () => {
    expect(byId['68001'].lineup).toEqual({
      id: 'Workshop',
      color: '#333dd7',
      textColor: '#ffffff',
    });
    expect(byId['68003'].lineup).toEqual({ id: 'Party', color: '#D56CD0', textColor: '#ffffff' });
    // No tags: the label defaults, the session-level color stands in.
    expect(byId['68002'].lineup).toEqual({ id: 'Event', color: '#123456', textColor: '#ffffff' });
  });

  it('takes the first http(s) contentEntity link as the url, else omits it', () => {
    expect(byId['67803'].url).toBe('https://maps.app.goo.gl/GCpWr55GjQajASA99');
    expect(byId['68001']).not.toHaveProperty('url'); // fediverse handle isn't a url
    expect(byId['68002']).not.toHaveProperty('url'); // no links at all
  });

  it('uses locationName as the venue, defaulting to TBA', () => {
    expect(byId['67803'].venueTitle).toBe('Other / See Description');
    expect(byId['68002'].venueTitle).toBe('TBA');
  });

  it('groups an after-midnight party under the prior con night (4 AM cutoff)', () => {
    expect(byId['68003'].day).toBe('Friday'); // 01:30 PDT Saturday → Friday night
    expect(byId['67803'].day).toBe('Wednesday');
  });
});

describe('festivalDayFor — 4 AM night cutoff (parties run late)', () => {
  it('rolls a 1 AM session back to the previous con day', () => {
    expect(festivalDayFor('2026-08-08T01:00:00')).toBe('Friday'); // early Saturday → Friday night
  });
  it('keeps a 5 AM session on its own day', () => {
    expect(festivalDayFor('2026-08-08T05:00:00')).toBe('Saturday');
  });
  it('treats exactly 4:00 AM as the new day, 3:59 as the old', () => {
    expect(festivalDayFor('2026-08-08T04:00:00')).toBe('Saturday');
    expect(festivalDayFor('2026-08-08T03:59:00')).toBe('Friday');
  });
  it('leaves a normal late-evening session on its day', () => {
    expect(festivalDayFor('2026-08-07T23:00:00')).toBe('Friday');
  });
});

describe('setsOnNow — running right now (started, not yet ended)', () => {
  const now = at('2026-08-07T19:45:00');
  const events = [
    ev('Track 1', '2026-08-07T18:45:00', '2026-08-07T20:15:00'), // started an hour ago, still going
    ev('Track 2', '2026-08-07T18:00:00', '2026-08-07T19:00:00'), // already ended
    ev('Track 3', '2026-08-07T20:00:00', '2026-08-07T21:00:00'), // hasn't started
  ];
  it("includes a session that started an hour ago but hasn't ended", () => {
    expect(setsOnNow(events, now).map((e) => e.venueTitle)).toEqual(['Track 1']);
  });
});

describe('upNextSets — the next wave (anchored on the next session, not the clock)', () => {
  const now = at('2026-08-07T19:30:00');
  const events = [
    ev('A', '2026-08-07T19:00:00', '2026-08-07T20:00:00'), // running now
    ev('A', '2026-08-07T20:00:00', '2026-08-07T21:00:00'), // up next #1
    ev('A', '2026-08-07T21:00:00', '2026-08-07T22:00:00'), // up next #2
    ev('A', '2026-08-07T22:30:00', '2026-08-07T23:30:00'), // 3rd — over per-room cap
    ev('B', '2026-08-07T19:30:00', '2026-08-07T20:30:00'), // running now
    ev('B', '2026-08-07T20:30:00', '2026-08-07T21:30:00'), // up next
    ev('C', '2026-08-08T00:30:00', '2026-08-08T01:30:00'), // a wave away — excluded
  ];
  const next = upNextSets(events, now);

  it('caps at two upcoming sessions per room', () => {
    const aTimes = next.filter((e) => e.venueTitle === 'A').map((e) => e.start);
    expect(aTimes).toEqual(['2026-08-07T20:00:00', '2026-08-07T21:00:00']); // not the 22:30 one
  });
  it('drops a room whose next session is a whole wave away', () => {
    // next wave anchors on 20:00 (+2h = 22:00), so C at 00:30 is out.
    expect(next.some((e) => e.venueTitle === 'C')).toBe(false);
  });
  it('never lists a currently-running session as up next', () => {
    expect(next.some((e) => e.start === '2026-08-07T19:00:00')).toBe(false);
    expect(next.some((e) => e.start === '2026-08-07T19:30:00')).toBe(false);
  });
  it('returns the wave sorted by start', () => {
    expect(next.map((e) => e.start)).toEqual([
      '2026-08-07T20:00:00', // A
      '2026-08-07T20:30:00', // B
      '2026-08-07T21:00:00', // A
    ]);
  });

  // The opening wave is visible even when the con is weeks out (anchor on the
  // next session, never on "now").
  it('shows the opening wave a month before the con', () => {
    const monthBefore = at('2026-07-01T12:00:00');
    const opening = [
      ev('A', '2026-08-05T17:00:00', '2026-08-05T18:00:00'),
      ev('B', '2026-08-05T17:30:00', '2026-08-05T18:30:00'),
      ev('C', '2026-08-05T20:30:00', '2026-08-05T21:30:00'), // later that night — next wave
    ];
    const n = upNextSets(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(['A', 'B']);
    expect(n.some((e) => e.venueTitle === 'C')).toBe(false);
  });

  // At the end of a night, "up next" rolls to the next morning's first sessions.
  it("rolls to the next morning after the night's last session", () => {
    const lateNight = at('2026-08-07T23:30:00');
    const evs = [
      ev('A', '2026-08-07T22:00:00', '2026-08-07T23:00:00'), // already ended
      ev('D', '2026-08-08T11:00:00', '2026-08-08T12:00:00'), // next morning
      ev('E', '2026-08-08T11:30:00', '2026-08-08T12:30:00'), // next morning
      ev('F', '2026-08-08T15:00:00', '2026-08-08T16:00:00'), // afternoon — next wave
    ];
    const n = upNextSets(evs, lateNight);
    expect(n.map((e) => e.venueTitle)).toEqual(['D', 'E']);
  });
});

describe('scheduleIcsItems — flattening My Faves for the .ics backend', () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it('maps favorite sessions with doc-keyed ids, location, and url', () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: '42',
          title: 'Hacking the Planet',
          start: '2026-08-07T13:00:00',
          end: '2026-08-07T14:00:00',
          venueTitle: 'LVCC - L1 - Track 1',
          url: 'https://defcon.org/x',
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: 'event-42',
        title: 'Hacking the Planet',
        start: '2026-08-07T13:00:00',
        end: '2026-08-07T14:00:00',
        location: 'LVCC - L1 - Track 1',
        url: 'https://defcon.org/x',
      },
    ]);
  });

  it('maps shifts through the injected time resolvers, defaulting the kind', () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: 's1', kind: 'Goon Shift', start: '2026-08-06T09:00:00', end: '2026-08-06T17:00:00' },
        { _id: 's2', start: '2026-08-07T09:00:00', end: '2026-08-07T12:00:00' }, // no kind
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['shift-s1', 'Goon Shift'],
      ['shift-s2', 'Shift'],
    ]);
  });

  it('trims whitespace-only kinds and titles instead of shipping strings the backend rejects', () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: '1', title: '   ', start: '2026-08-07T13:00:00', end: '2026-08-07T14:00:00' }, // dropped
        {
          eventId: '2',
          title: '  Real Talk  ',
          start: '2026-08-07T13:00:00',
          end: '2026-08-07T14:00:00',
        },
      ],
      shifts: [
        { _id: 's1', kind: '   ', start: '2026-08-06T09:00:00', end: '2026-08-06T17:00:00' },
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
        { _id: 'zero', kind: 'Shift', start: '2026-08-06T09:00:00', end: '2026-08-06T09:00:00' },
        // Same-day strings with end before start = the extras form's overnight shape.
        {
          _id: 'overnight',
          kind: 'Line con',
          start: '2026-08-06T22:00:00',
          end: '2026-08-06T01:00:00',
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
        { eventId: '1', title: '', start: '2026-08-07T13:00:00', end: '2026-08-07T14:00:00' },
      ],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: 'bad', kind: 'Shift', start: '2026-08-06T:00', end: '2026-08-06T17:00:00' },
        { _id: 'ok', kind: 'Shift', start: '2026-08-06T09:00:00', end: '2026-08-06T17:00:00' },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(['shift-ok']);
  });
});

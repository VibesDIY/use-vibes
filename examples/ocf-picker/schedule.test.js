import { describe, it, expect } from 'vitest';
import {
  festivalDayFor,
  setsOnNow,
  upNextSets,
  toFestivalDate,
  parseLineupHtml,
  flattenSchedule,
  scheduleIcsItems,
  decodeEntities,
  GENRE_COLORS,
  GENRE_DEFAULT_COLOR,
  parseWorkshopsHtml,
} from './festival-utils.js';

// Everything is anchored through toFestivalDate so events and "now" share one frame.
const at = (s) => toFestivalDate(s).getTime();
const ev = (venueTitle, start, end, eventId = `${venueTitle}-${start}`) => ({
  eventId,
  venueTitle,
  start,
  end,
});

// A trimmed slice of the real lineup page (verbatim rows, single-quoted WP
// markup), covering the live variants: a plain row, both sloppy-meridiem
// shapes ("12:00 - 12:50PM" and "1:15 - 2:00PM"), entity-encoded titles
// (&amp; and &#039;), a StewardShip row with NO cat- token and an empty genre
// span (plus a literal tab inside the time text), a multi-genre row
// (cat-dance cat-movement cat-music), one 12 AM row (synthetic time on a real
// row shape — the live page is all daytime), and one row whose time is
// unparseable and must be skipped.
const FIXTURE_HTML = `<html><body><div id='lineup'>
<div class='session 2026-07-10 cat-vaudeville stage-left '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/jan-luby/'><span class='time'>11:00 AM - 11:30 AM</span><span class='title'>Jan Luby</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Stage Left</span><span class='genre column'><i class='fas fa-star'></i>Vaudeville</span></div></div></div>
<div class='session 2026-07-11 cat-spoken-word chez-rays '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/rainbow-connection-panel/'><span class='time'>12:00 - 12:50PM</span><span class='title'>Rainbow Connection Panel</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Chez Rays</span><span class='genre column'><i class='fas fa-star'></i>Spoken Word</span></div></div></div>
<div class='session 2026-07-12 cat-music youth-stage '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/the-event/the-lineup/'><span class='time'>1:15 - 2:00PM</span><span class='title'>Recycleman&#039;s EcoHero Show</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Youth Stage</span><span class='genre column'><i class='fas fa-star'></i>Music</span></div></div></div>
<div class='session 2026-07-10 cat-music morningwood-odditorium '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/wren-juniper/'><span class='time'>1:15 PM - 2:15 PM</span><span class='title'>Wren &amp; Juniper</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Morningwood Odditorium</span><span class='genre column'><i class='fas fa-star'></i>Music</span></div></div></div>
<div class='session 2026-07-10 stewardship '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/paper-making/'><span class='time'>12:00 PM - 1:30\tPM</span><span class='title'>Paper Making</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>StewardShip</span><span class='genre column'><i class='fas fa-star'></i></span></div></div></div>
<div class='session 2026-07-10 cat-dance cat-movement cat-music dance-pavilion '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/shelby-natasha/'><span class='time'>12:15 PM - 1:15 PM</span><span class='title'>Shelby Natasha</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Dance Pavilion</span><span class='genre column'><i class='fas fa-star'></i>Dance, Movement, Music</span></div></div></div>
<div class='session 2026-07-11 cat-ambiance ambiance-on-the-path '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/midnight-drums/'><span class='time'>12:00 AM - 1:00 AM</span><span class='title'>Midnight Drums</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Ambiance on the Path</span><span class='genre column'><i class='fas fa-star'></i>Ambiance</span></div></div></div>
<div class='session 2026-07-12 cat-music main-stage '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/tba/'><span class='time'>TBA - TBA</span><span class='title'>TBD Placeholder</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Main Stage</span><span class='genre column'><i class='fas fa-star'></i>Music</span></div></div></div>
</div></body></html>`;

describe('parseLineupHtml — the lineup page → session objects', () => {
  const sessions = parseLineupHtml(FIXTURE_HTML);
  const byTitle = Object.fromEntries(sessions.map((s) => [s.title, s]));

  it('parses every row with a date and a parseable time, skipping the rest', () => {
    expect(sessions).toHaveLength(7);
    expect(byTitle['TBD Placeholder']).toBeUndefined(); // "TBA - TBA" can't be placed
  });

  it("takes the date from the session div's class token", () => {
    expect(byTitle['Jan Luby'].start).toBe('2026-07-10T11:00:00');
    expect(byTitle['Jan Luby'].end).toBe('2026-07-10T11:30:00');
    expect(byTitle['Rainbow Connection Panel'].start.startsWith('2026-07-11')).toBe(true);
  });

  it('inherits a missing start meridiem from the end time', () => {
    // "12:00 - 12:50PM" → 12:00 PM (noon), not midnight.
    expect(byTitle['Rainbow Connection Panel'].start).toBe('2026-07-11T12:00:00');
    expect(byTitle['Rainbow Connection Panel'].end).toBe('2026-07-11T12:50:00');
    // "1:15 - 2:00PM" → 1:15 PM.
    expect(byTitle["Recycleman's EcoHero Show"].start).toBe('2026-07-12T13:15:00');
    expect(byTitle["Recycleman's EcoHero Show"].end).toBe('2026-07-12T14:00:00');
  });

  it('steps an inherited start back 12h when it would land after the end', () => {
    // "11:30 - 12:30PM" inherits PM → 23:30 > 12:30, so it must resolve to 11:30 AM.
    const row = FIXTURE_HTML.replace('12:00 - 12:50PM', '11:30 - 12:30PM');
    const s = parseLineupHtml(row).find((x) => x.title === 'Rainbow Connection Panel');
    expect(s.start).toBe('2026-07-11T11:30:00');
    expect(s.end).toBe('2026-07-11T12:30:00');
  });

  it('handles 12 AM and 12 PM correctly (12 AM = 00:00, 12 PM = 12:00)', () => {
    expect(byTitle['Midnight Drums'].start).toBe('2026-07-11T00:00:00');
    expect(byTitle['Midnight Drums'].end).toBe('2026-07-11T01:00:00');
    expect(byTitle['Paper Making'].start).toBe('2026-07-10T12:00:00');
  });

  it('normalizes tabs inside the time text (a live-page shape)', () => {
    expect(byTitle['Paper Making'].end).toBe('2026-07-10T13:30:00');
  });

  it('rolls an end at/before its start forward (+1h when equal, next day when earlier)', () => {
    const equal = FIXTURE_HTML.replace('11:00 AM - 11:30 AM', '11:00 AM - 11:00 AM');
    expect(parseLineupHtml(equal).find((x) => x.title === 'Jan Luby').end).toBe(
      '2026-07-10T12:00:00'
    );
    const overnight = FIXTURE_HTML.replace('11:00 AM - 11:30 AM', '11:00 PM - 1:00 AM');
    expect(parseLineupHtml(overnight).find((x) => x.title === 'Jan Luby').end).toBe(
      '2026-07-11T01:00:00'
    );
  });

  it('decodes HTML entities in titles', () => {
    expect(byTitle['Wren & Juniper']).toBeDefined();
    expect(byTitle["Recycleman's EcoHero Show"]).toBeDefined();
  });

  it('takes the artist-page url from the wrapping anchor', () => {
    expect(byTitle['Jan Luby'].url).toBe(
      'https://www.oregoncountryfair.org/entertainment/jan-luby/'
    );
  });

  it('uses the location span as the venue display name', () => {
    expect(byTitle['Wren & Juniper'].venueTitle).toBe('Morningwood Odditorium');
    expect(byTitle['Paper Making'].venueTitle).toBe('StewardShip');
  });

  it('maps genres to the fixed palette', () => {
    expect(byTitle['Jan Luby'].lineup).toEqual({
      id: 'Vaudeville',
      color: GENRE_COLORS.vaudeville,
    });
    expect(byTitle['Wren & Juniper'].lineup).toEqual({ id: 'Music', color: GENRE_COLORS.music });
    expect(byTitle['Rainbow Connection Panel'].lineup).toEqual({
      id: 'Spoken Word',
      color: GENRE_COLORS['spoken-word'],
    });
    expect(byTitle['Midnight Drums'].lineup).toEqual({
      id: 'Ambiance',
      color: GENRE_COLORS.ambiance,
    });
  });

  it('colors a multi-genre row by its first palette-mapped cat token', () => {
    // cat-dance has no palette entry; cat-movement is the first mapped one.
    expect(byTitle['Shelby Natasha'].lineup).toEqual({
      id: 'Dance, Movement, Music',
      color: GENRE_COLORS.movement,
    });
  });

  it('defaults a row with no genre at all (StewardShip) to Event + the default color', () => {
    expect(byTitle['Paper Making'].lineup).toEqual({ id: 'Event', color: GENRE_DEFAULT_COLOR });
  });

  it('builds deterministic synthetic eventIds — a favorite must survive a re-fetch', () => {
    expect(byTitle['Jan Luby'].eventId).toBe('2026-07-10|11:00|stage-left|jan-luby');
    expect(byTitle["Recycleman's EcoHero Show"].eventId).toBe(
      '2026-07-12|13:15|youth-stage|recycleman-s-ecohero-show'
    );
    const again = parseLineupHtml(FIXTURE_HTML);
    expect(again.map((s) => s.eventId)).toEqual(sessions.map((s) => s.eventId));
    expect(new Set(sessions.map((s) => s.eventId)).size).toBe(sessions.length);
  });
});

describe('flattenSchedule — parsed sessions → internal shape with fair days', () => {
  const flat = flattenSchedule(parseLineupHtml(FIXTURE_HTML));
  const byTitle = Object.fromEntries(flat.map((e) => [e.title, e]));

  it('stamps each session with its fair day', () => {
    expect(byTitle['Jan Luby'].day).toBe('Friday');
    expect(byTitle['Rainbow Connection Panel'].day).toBe('Saturday');
    expect(byTitle["Recycleman's EcoHero Show"].day).toBe('Sunday');
  });

  it('groups an after-midnight set under the prior fair night (4 AM cutoff)', () => {
    // Midnight Drums starts 00:00 Saturday → belongs to Friday night.
    expect(byTitle['Midnight Drums'].day).toBe('Friday');
  });

  it('drops non-objects and rows without a parseable start', () => {
    expect(flattenSchedule(null)).toEqual([]);
    expect(flattenSchedule([null, { title: 'x' }, { title: 'y', start: 'junk' }])).toEqual([]);
  });
});

describe('decodeEntities — pure entity decoding (no DOM anywhere it runs)', () => {
  it('decodes the named and numeric entities the page uses', () => {
    expect(decodeEntities('Wren &amp; Juniper')).toBe('Wren & Juniper');
    expect(decodeEntities('The She&#039;booms')).toBe("The She'booms");
  });
  it('passes unknown entities and non-strings through', () => {
    expect(decodeEntities('a &bogus; b')).toBe('a &bogus; b');
    expect(decodeEntities(42)).toBe(42);
  });
});

describe('festivalDayFor — 4 AM night cutoff', () => {
  it('rolls a 1 AM set back to the previous fair day', () => {
    expect(festivalDayFor('2026-07-11T01:00:00')).toBe('Friday'); // early Saturday → Friday night
  });
  it('keeps a 5 AM set on its own day', () => {
    expect(festivalDayFor('2026-07-11T05:00:00')).toBe('Saturday');
  });
  it('treats exactly 4:00 AM as the new day, 3:59 as the old', () => {
    expect(festivalDayFor('2026-07-11T04:00:00')).toBe('Saturday');
    expect(festivalDayFor('2026-07-11T03:59:00')).toBe('Friday');
  });
  it('leaves a normal late-evening set on its day', () => {
    expect(festivalDayFor('2026-07-10T23:00:00')).toBe('Friday');
  });
});

describe('setsOnNow — on stage right now (started, not yet ended)', () => {
  const now = at('2026-07-10T19:45:00');
  const events = [
    ev('Main Stage', '2026-07-10T18:45:00', '2026-07-10T20:15:00'), // started an hour ago, still going
    ev('Stage Left', '2026-07-10T18:00:00', '2026-07-10T19:00:00'), // already ended
    ev('Kesey Stage', '2026-07-10T20:00:00', '2026-07-10T21:00:00'), // hasn't started
  ];
  it("includes a set that started an hour ago but hasn't ended", () => {
    expect(setsOnNow(events, now).map((e) => e.venueTitle)).toEqual(['Main Stage']);
  });
});

describe('upNextSets — the next wave (anchored on the next set, not the clock)', () => {
  const now = at('2026-07-10T19:30:00');
  const events = [
    ev('A', '2026-07-10T19:00:00', '2026-07-10T20:00:00'), // running now
    ev('A', '2026-07-10T20:00:00', '2026-07-10T21:00:00'), // up next #1
    ev('A', '2026-07-10T21:00:00', '2026-07-10T22:00:00'), // up next #2
    ev('A', '2026-07-10T22:30:00', '2026-07-10T23:30:00'), // 3rd — over per-stage cap
    ev('B', '2026-07-10T19:30:00', '2026-07-10T20:30:00'), // running now
    ev('B', '2026-07-10T20:30:00', '2026-07-10T21:30:00'), // up next
    ev('C', '2026-07-11T00:30:00', '2026-07-11T01:30:00'), // a wave away — excluded
  ];
  const next = upNextSets(events, now);

  it('caps at two upcoming sets per stage', () => {
    const aTimes = next.filter((e) => e.venueTitle === 'A').map((e) => e.start);
    expect(aTimes).toEqual(['2026-07-10T20:00:00', '2026-07-10T21:00:00']); // not the 22:30 one
  });
  it('drops a stage whose next set is a whole wave away', () => {
    // next wave anchors on 20:00 (+2h = 22:00), so C at 00:30 is out.
    expect(next.some((e) => e.venueTitle === 'C')).toBe(false);
  });
  it('never lists a currently-running set as up next', () => {
    expect(next.some((e) => e.start === '2026-07-10T19:00:00')).toBe(false);
    expect(next.some((e) => e.start === '2026-07-10T19:30:00')).toBe(false);
  });
  it('returns the wave sorted by start', () => {
    expect(next.map((e) => e.start)).toEqual([
      '2026-07-10T20:00:00', // A
      '2026-07-10T20:30:00', // B
      '2026-07-10T21:00:00', // A
    ]);
  });

  // The opening wave is visible even when the fair is weeks out (anchor on the
  // next set, never on "now").
  it('shows the opening wave a month before the fair', () => {
    const monthBefore = at('2026-06-01T12:00:00');
    const opening = [
      ev('A', '2026-07-10T11:00:00', '2026-07-10T12:00:00'),
      ev('B', '2026-07-10T11:30:00', '2026-07-10T12:30:00'),
      ev('C', '2026-07-10T14:30:00', '2026-07-10T15:30:00'), // later that day — next wave
    ];
    const n = upNextSets(opening, monthBefore);
    expect(n.map((e) => e.venueTitle)).toEqual(['A', 'B']);
    expect(n.some((e) => e.venueTitle === 'C')).toBe(false);
  });

  // At the end of a day, "up next" rolls to the next morning's first sets.
  it("rolls to the next morning after the day's last set", () => {
    const lateNight = at('2026-07-10T23:30:00');
    const evs = [
      ev('A', '2026-07-10T22:00:00', '2026-07-10T23:00:00'), // already ended
      ev('D', '2026-07-11T11:00:00', '2026-07-11T12:00:00'), // next morning
      ev('E', '2026-07-11T11:30:00', '2026-07-11T12:30:00'), // next morning
      ev('F', '2026-07-11T15:00:00', '2026-07-11T16:00:00'), // afternoon — next wave
    ];
    const n = upNextSets(evs, lateNight);
    expect(n.map((e) => e.venueTitle)).toEqual(['D', 'E']);
  });
});

describe('scheduleIcsItems — flattening My Faves for the .ics backend', () => {
  const shiftStart = (s) => s.start;
  const shiftEnd = (s) => s.end;

  it('maps favorite sets with doc-keyed ids, location, and url', () => {
    const items = scheduleIcsItems({
      events: [
        {
          eventId: '2026-07-10|11:00|stage-left|jan-luby',
          title: 'Jan Luby',
          start: '2026-07-10T11:00:00',
          end: '2026-07-10T11:30:00',
          venueTitle: 'Stage Left',
          url: 'https://www.oregoncountryfair.org/entertainment/jan-luby/',
        },
      ],
      shifts: [],
      shiftStart,
      shiftEnd,
    });
    expect(items).toEqual([
      {
        id: 'event-2026-07-10|11:00|stage-left|jan-luby',
        title: 'Jan Luby',
        start: '2026-07-10T11:00:00',
        end: '2026-07-10T11:30:00',
        location: 'Stage Left',
        url: 'https://www.oregoncountryfair.org/entertainment/jan-luby/',
      },
    ]);
  });

  it('maps shifts through the injected time resolvers, defaulting the kind', () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        {
          _id: 's1',
          kind: 'Booth Shift',
          start: '2026-07-10T09:00:00',
          end: '2026-07-10T17:00:00',
        },
        { _id: 's2', start: '2026-07-11T09:00:00', end: '2026-07-11T12:00:00' }, // no kind
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['shift-s1', 'Booth Shift'],
      ['shift-s2', 'Shift'],
    ]);
  });

  it('trims whitespace-only kinds and titles instead of shipping strings the backend rejects', () => {
    const items = scheduleIcsItems({
      events: [
        { eventId: '1', title: '   ', start: '2026-07-10T13:00:00', end: '2026-07-10T14:00:00' }, // dropped
        {
          eventId: '2',
          title: '  Real Act  ',
          start: '2026-07-10T13:00:00',
          end: '2026-07-10T14:00:00',
        },
      ],
      shifts: [
        { _id: 's1', kind: '   ', start: '2026-07-10T09:00:00', end: '2026-07-10T17:00:00' },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['event-2', 'Real Act'],
      ['shift-s1', 'Shift'],
    ]);
  });

  it('drops zero-duration shifts but keeps overnight ones for the backend to normalize', () => {
    const items = scheduleIcsItems({
      events: [],
      shifts: [
        { _id: 'zero', kind: 'Shift', start: '2026-07-10T09:00:00', end: '2026-07-10T09:00:00' },
        // Same-day strings with end before start = the extras form's overnight shape.
        {
          _id: 'overnight',
          kind: 'Night watch',
          start: '2026-07-10T22:00:00',
          end: '2026-07-10T01:00:00',
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
        { eventId: '1', title: '', start: '2026-07-10T13:00:00', end: '2026-07-10T14:00:00' },
      ],
      shifts: [
        // The known legacy shape: a cleared time input persisted as `<date>T:00`.
        { _id: 'bad', kind: 'Shift', start: '2026-07-10T:00', end: '2026-07-10T17:00:00' },
        { _id: 'ok', kind: 'Shift', start: '2026-07-10T09:00:00', end: '2026-07-10T17:00:00' },
      ],
      shiftStart,
      shiftEnd,
    });
    expect(items.map((i) => i.id)).toEqual(['shift-ok']);
  });
});

describe('parseWorkshopsHtml — the Community Village workshops page', () => {
  // Distilled from the live page's real shapes (2026-07-09): Elementor text
  // soup with day headers, hour headers, "Title – Presenter: description. Venue"
  // lines, a venue wrapped into its own element, a Noon–6pm span prefix, and an
  // ALL DAY, EVERY DAY section ahead of the first day header.
  const PAGE = `
<html><body>
<h1>Community Village Workshops</h1>
<h4>ALL DAY, EVERY DAY</h4>
<h4>Queer &amp; Trans Clothing Swap, Take clothes, leave clothes, build community! Rainbow Village</h4>
<p>FRIDAY</p>
<p>11:00</p>
<p>Bioregional Food Systems – Kelson Gorman: Think global and act local. Village Green</p>
<p>Story Stick – Weave a story as you add beads. Arts Booth</p>
<p>12:00</p>
<p>Noon–6pm, Healthy Bees Observation Hive: Come give love and light to our precious honey bees!</p>
<p>Comm-Unity House</p>
<p>1:00</p>
<p>NA Meeting: Open meeting. Yurt</p>
<p>SATURDAY</p>
<p>5:00</p>
<p>Rainbow Village&#8217;s Cribbage Tournament Dome</p>
<p>Oregon Country Fair is an independent 501(c)(3) nonprofit organization.</p>
<h2>Stay Informed</h2>
</body></html>`;
  const ws = parseWorkshopsHtml(PAGE);
  const byId = Object.fromEntries(ws.map((w) => [w.eventId, w]));

  it('parses hour-block items with deterministic cv| eventIds and one-hour slots', () => {
    const w = byId['cv|2026-07-10|11:00|bioregional-food-systems'];
    expect(w).toBeDefined();
    expect(w.start).toBe('2026-07-10T11:00:00');
    expect(w.end).toBe('2026-07-10T12:00:00');
    expect(w.venueTitle).toBe('Village Green · Community Village');
    expect(w.description).toContain('Kelson Gorman');
    expect(w.isWorkshop).toBe(true);
    expect(w.lineup).toEqual({ id: 'Workshop', color: GENRE_COLORS.workshop });
  });

  it('maps the 1:00–6:00 grid hours to PM', () => {
    expect(byId['cv|2026-07-10|13:00|na-meeting']).toBeDefined();
    expect(byId['cv|2026-07-11|17:00|rainbow-village-s-cribbage-tournament']).toBeDefined();
  });

  it('attaches a venue wrapped into its own element to the previous item', () => {
    const bees = ws.find((w) => w.title === 'Healthy Bees Observation Hive');
    expect(bees.venueTitle).toBe('Comm-Unity House · Community Village');
  });

  it('honors the Noon–6pm span prefix over the hour block default', () => {
    const bees = ws.find((w) => w.title === 'Healthy Bees Observation Hive');
    expect(bees.start).toBe('2026-07-10T12:00:00');
    expect(bees.end).toBe('2026-07-10T18:00:00');
  });

  it('strips a bare trailing venue from a no-description line', () => {
    const crib = byId['cv|2026-07-11|17:00|rainbow-village-s-cribbage-tournament'];
    expect(crib.title).toBe('Rainbow Village’s Cribbage Tournament');
    expect(crib.venueTitle).toBe('Dome · Community Village');
  });

  it('expands ALL DAY, EVERY DAY items to open-hours entries on every fair day', () => {
    const swaps = ws.filter((w) => w.title.startsWith('Queer & Trans Clothing Swap'));
    expect(swaps.map((w) => w.start)).toEqual([
      '2026-07-10T11:00:00',
      '2026-07-11T11:00:00',
      '2026-07-12T11:00:00',
    ]);
    expect(swaps.every((w) => w.end.endsWith('19:00:00'))).toBe(true);
    expect(swaps.every((w) => w.venueTitle === 'Rainbow Village · Community Village')).toBe(true);
  });

  it('stops at the footer and fails empty (not wrong) when the markers are missing', () => {
    expect(ws.some((w) => w.title.includes('501(c)(3)'))).toBe(false);
    expect(parseWorkshopsHtml('<html><body>totally different page</body></html>')).toEqual([]);
  });

  it('returns the board sorted by start', () => {
    const starts = ws.map((w) => w.start);
    expect(starts).toEqual([...starts].sort());
  });
});

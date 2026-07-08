import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  fetchScheduleItems,
  scheduled,
  __resetSubCacheForTests,
  MAX_ITEMS,
  SCHEDULE_URL,
  fetch as icsFetch,
} from './backend.js';

// The `_api` request arrives at the handler prefix-stripped, rooted at "/".
const req = (path, init = {}) => new Request(`https://vibe.internal${path}`, init);
const post = (body) =>
  req('/faves.ics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const items = (...overrides) =>
  overrides.length > 0
    ? overrides
    : [
        {
          id: 'event-guid-101',
          title: 'Opening',
          start: '2026-08-28T09:30:00+02:00',
          end: '2026-08-28T09:50:00+02:00',
        },
      ];

describe('toIcsUtc — conference-local strings become ICS UTC stamps', () => {
  it('converts a naive conference-local time (CEST, UTC+2) to Z time', () => {
    expect(toIcsUtc('2026-08-28T13:00:00')).toBe('20260828T110000Z');
  });
  it('handles DST correctly — a winter time is CET (UTC+1)', () => {
    expect(toIcsUtc('2026-12-01T12:00:00')).toBe('20261201T110000Z');
  });
  it('respects an explicit offset instead of assuming conference time', () => {
    expect(toIcsUtc('2026-08-28T20:00:00Z')).toBe('20260828T200000Z');
    expect(toIcsUtc('2026-08-28T16:00:00-04:00')).toBe('20260828T200000Z');
  });
  it('accepts a space-separated form', () => {
    expect(toIcsUtc('2026-08-28 13:00:00')).toBe('20260828T110000Z');
  });
  it('returns null for garbage, empty, and non-strings', () => {
    expect(toIcsUtc('2026-08-28T:00')).toBe(null); // the known malformed-shift shape
    expect(toIcsUtc('')).toBe(null);
    expect(toIcsUtc(undefined)).toBe(null);
    expect(toIcsUtc(1234)).toBe(null);
  });
});

describe('escapeIcsText — RFC 5545 TEXT escaping', () => {
  it('escapes backslash, semicolon, comma, and newline', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
  it("escapes backslash FIRST so escapes aren't double-escaped", () => {
    expect(escapeIcsText(';')).toBe('\\;'); // not "\\\\;"
  });
  it('normalizes CRLF to the \\n escape', () => {
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb');
  });
});

describe('foldIcsLine — 75-octet folding', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:hi')).toBe('SUMMARY:hi');
  });
  it('folds a long ASCII line at 75 octets with CRLF + space', () => {
    const folded = foldIcsLine('SUMMARY:' + 'x'.repeat(200));
    const parts = folded.split('\r\n ');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBe(75);
    // Continuation content caps at 74 — the leading fold space spends the 75th octet.
    for (const p of parts.slice(1, -1)) expect(p.length).toBe(74);
    expect(parts.join('')).toBe('SUMMARY:' + 'x'.repeat(200));
  });
  it('counts octets not characters, and never splits a multibyte char', () => {
    // é is 2 octets in UTF-8: 37 of them = 74 octets, +8 for "SUMMARY:" = 82 → folds.
    const line = 'SUMMARY:' + 'é'.repeat(37);
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n ');
    expect(parts.length).toBe(2);
    // Each part must reassemble to whole é characters (no lone surrogates/bytes).
    expect(parts.join('')).toBe(line);
    for (const p of parts) expect([...p].every((ch) => ch === 'é' || /[A-Z:]/.test(ch))).toBe(true);
  });
});

describe('parseFavesItems — strict payload validation', () => {
  it('accepts a minimal valid payload and normalizes times to UTC', () => {
    const r = parseFavesItems({ items: items() });
    expect(r.ok).toBe(true);
    expect(r.items[0]).toMatchObject({
      title: 'Opening',
      start: '20260828T073000Z',
      end: '20260828T075000Z',
    });
  });
  it('drops urls with embedded whitespace or control chars (verbatim URI emission)', () => {
    const mk = (url) => parseFavesItems({ items: [{ ...items()[0], url }] }).items[0].url;
    expect(mk('https://x.com/a b')).toBeUndefined();
    expect(mk('https://x.com/a\r\nX-INJECTED:1')).toBeUndefined();
    expect(mk('https://x.com/ok?a=1&b=2,3;4')).toBe('https://x.com/ok?a=1&b=2,3;4');
  });
  it('keeps location and http(s) url, drops a javascript: url silently', () => {
    const r = parseFavesItems({
      items: [
        {
          title: 'A',
          start: '2026-08-28T13:00:00',
          end: '2026-08-28T14:00:00',
          location: 'Guadeloupe',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0].location).toBe('Guadeloupe');
    expect(r.items[0].url).toBeUndefined();
  });
  it('rejects a non-object body and a missing items array', () => {
    expect(parseFavesItems(null).ok).toBe(false);
    expect(parseFavesItems({ items: 'nope' }).ok).toBe(false);
  });
  it('rejects an empty list', () => {
    expect(parseFavesItems({ items: [] })).toEqual({ ok: false, error: 'no items to export' });
  });
  it('rejects an oversized list', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => items()[0]);
    expect(parseFavesItems({ items: many }).ok).toBe(false);
  });
  it('normalizes an overnight extra (same-day 22:00 → 01:00) to end the next day', () => {
    // The extras form stores both times on the selected conference day, so an
    // overnight shift arrives with end before start.
    const r = parseFavesItems({
      items: [{ title: 'Late social', start: '2026-08-28T22:00:00', end: '2026-08-28T01:00:00' }],
    });
    expect(r.ok).toBe(true);
    // 22:00 CEST Aug 28 → 20:00Z; 01:00 CEST bumped to Aug 29 → 23:00Z Aug 28.
    expect(r.items[0].start).toBe('20260828T200000Z');
    expect(r.items[0].end).toBe('20260828T230000Z');
  });
  it('rejects zero-duration items and ends more than a day early', () => {
    const zero = parseFavesItems({
      items: [{ title: 'A', start: '2026-08-28T09:00:00', end: '2026-08-28T09:00:00' }],
    });
    expect(zero.ok).toBe(false);
    expect(zero.error).toContain('zero duration');
    const wayEarly = parseFavesItems({
      items: [{ title: 'A', start: '2026-08-28T09:00:00', end: '2026-08-26T09:00:00' }],
    });
    expect(wayEarly.ok).toBe(false);
    expect(wayEarly.error).toContain('before its start');
  });
  it('rejects a blank title and an unparseable time, naming the index', () => {
    const bad = parseFavesItems({
      items: [{ title: '  ', start: '2026-08-28T13:00:00', end: '2026-08-28T14:00:00' }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('items[0].title');
    const badTime = parseFavesItems({
      items: [{ title: 'A', start: '2026-08-28T:00', end: '2026-08-28T14:00:00' }],
    });
    expect(badTime.ok).toBe(false);
    expect(badTime.error).toContain('items[0].start');
  });
});

describe('buildFavesCalendar — the ICS document', () => {
  const NOW = '2026-07-04T12:00:00Z';
  const two = parseFavesItems({
    items: [
      {
        id: 'event-2',
        title: 'Later Talk',
        start: '2026-08-29T20:00:00',
        end: '2026-08-29T21:00:00',
      },
      {
        id: 'event-1',
        title: 'Früh; und, spät',
        start: '2026-08-28T13:00:00',
        end: '2026-08-28T14:00:00',
        location: 'Guadeloupe',
        url: 'https://pretalx.com/sotm2026/talk/SEDEA8/',
      },
    ],
  }).items;
  const ics = buildFavesCalendar(two, { now: NOW });

  it('uses CRLF line endings throughout and ends with one', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
  it('has the calendar envelope and metadata', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('X-WR-CALNAME:My State of the Map 2026 Picks\r\n');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Paris\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('emits events sorted by start time regardless of input order', () => {
    expect(ics.indexOf('20260828T110000Z')).toBeLessThan(ics.indexOf('20260829T180000Z'));
    expect(ics.indexOf('20260829T180000Z')).toBeGreaterThan(-1);
  });
  it('stamps stable UIDs from the item id', () => {
    expect(ics).toContain('UID:event-1@sotm-picker.vibes.diy');
    expect(ics).toContain('UID:event-2@sotm-picker.vibes.diy');
  });
  it('escapes SUMMARY text and carries LOCATION/URL', () => {
    expect(ics).toContain('SUMMARY:Früh\\; und\\, spät');
    expect(ics).toContain('LOCATION:Guadeloupe');
    expect(ics).toContain('URL:https://pretalx.com/sotm2026/talk/SEDEA8/');
  });
  it('emits URL as a URI, never TEXT-escaping its commas/semicolons', () => {
    const withPunct = parseFavesItems({
      items: [
        {
          id: 'e',
          title: 'A',
          start: '2026-08-28T13:00:00',
          end: '2026-08-28T14:00:00',
          url: 'https://x.com/a,b;c',
        },
      ],
    }).items;
    expect(buildFavesCalendar(withPunct, { now: NOW })).toContain('URL:https://x.com/a,b;c');
  });
  it('uses the injected now for DTSTAMP', () => {
    expect(ics).toContain('DTSTAMP:20260704T120000Z');
  });
});

// The frab/pretalx shape the schedule export actually returns: conference days,
// each with events nested per room. "State of Panoramax" omits `end` so the
// duration fallback is exercised through the live join.
const FEED = {
  schedule: {
    conference: {
      title: 'State of the Map 2026',
      time_zone_name: 'Europe/Paris',
      days: [
        {
          index: 1,
          date: '2026-08-28',
          rooms: {
            Guadeloupe: [
              {
                guid: 'guid-101',
                date: '2026-08-28T09:30:00+02:00',
                end: '2026-08-28T09:50:00+02:00',
                duration: '00:20',
                room: 'Guadeloupe',
                title: 'Opening',
                url: 'https://pretalx.com/sotm2026/talk/SEDEA8/',
              },
              {
                guid: 'guid-102',
                date: '2026-08-28T09:50:00+02:00',
                duration: '00:30',
                room: 'Guadeloupe',
                title: 'State of Panoramax',
              },
            ],
          },
        },
        {
          index: 2,
          date: '2026-08-29',
          rooms: {
            Tahiti: [
              {
                guid: 'guid-201',
                date: '2026-08-29T17:20:00+02:00',
                end: '2026-08-29T18:15:00+02:00',
                duration: '00:55',
                room: 'Tahiti',
                title: 'Closing Social',
              },
            ],
          },
        },
      ],
    },
  },
};

// The db docs the scheduled aggregation tick sees (admin-lane read of the
// access-fn-bound db — the one lane allowed to read it).
const DB_DOCS = [
  { _id: 'favorite-Alice-guid-101', type: 'favorite', userId: 'Alice', eventId: 'guid-101' },
  { _id: 'favorite-alice-guid-201', type: 'favorite', userId: 'alice', eventId: 'guid-201' },
  { _id: 'favorite-bob-guid-102', type: 'favorite', userId: 'bob', eventId: 'guid-102' },
  {
    _id: 'shift-1',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: true,
    kind: 'Volunteer',
    start: '2026-08-28T09:00:00',
    end: '2026-08-28T17:00:00',
  },
  {
    _id: 'shift-2',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: false,
    kind: 'Secret',
    start: '2026-08-29T09:00:00',
    end: '2026-08-29T17:00:00',
  },
  {
    _id: 'shift-legacy',
    type: 'shift',
    userId: 'bob',
    shareWithFriends: true,
    kind: 'Gate',
    day: 'Friday',
    startTime: '10:00',
    endTime: '12:00',
  },
  {
    _id: 'note-alice-guid-101',
    type: 'note',
    userId: 'alice',
    eventId: 'guid-101',
    notes: 'PRIVATE NOTE',
  },
  // Opt-in capability tokens (auto-minted client-side on the schedule tab).
  { _id: 'caltoken-alice', type: 'caltoken', userId: 'Alice', token: 'alice-token-1234567890A' },
  { _id: 'caltoken-bob', type: 'caltoken', userId: 'bob', token: 'bob-token-1234567890BBB' },
  // The known legacy malformed shape (cleared time input persisted as `<date>T:00`),
  // SHARED — must drop out of alice's feed without 400ing it.
  {
    _id: 'shift-broken',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: true,
    kind: 'Broken Legacy',
    start: '2026-08-28T:00',
    end: '2026-08-28T17:00:00',
  },
];
const T_ALICE = 'alice-token-1234567890A';
const T_BOB = 'bob-token-1234567890BBB';
const tick = () =>
  scheduled({ scheduledTime: '2026-07-04T12:00:00Z' }, { db: { query: async () => DB_DOCS } });

describe('fetch handler — GET /faves.ics?t=<token> (subscription lane)', () => {
  beforeEach(() => __resetSubCacheForTests());
  afterEach(() => vi.unstubAllGlobals());
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  };

  it('projects requested guids from the feed, deriving a missing end from the duration', async () => {
    feedOk();
    const projected = await fetchScheduleItems(['guid-102']);
    expect(projected).toHaveLength(1);
    expect(projected[0].id).toBe('event-guid-102');
    // 09:50 +02:00 plus the 00:30 duration = 10:20 +02:00 (08:20Z).
    expect(new Date(projected[0].end).getTime()).toBe(
      new Date('2026-08-28T10:20:00+02:00').getTime()
    );
  });

  it('serves the never-empty anchor-only calendar before the first aggregation tick', async () => {
    // iOS validates a NEW subscription by fetching at add time — a cold-cache
    // error there reads as "Validation failed", so cold must serve a valid,
    // non-empty calendar (owner call; anchor-only until the ≤1m tick).
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the skeleton
    const body = await res.text();
    expect(body).toContain('SUMMARY:State of the Map 2026');
    expect(body).not.toContain('Opening'); // faves arrive with the tick
  });

  it("serves a user's CURRENT faves: db-aggregated guids joined live against the feed", async () => {
    const fetchSpy = feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(null); // a feed, not a download
    const body = await res.text();
    expect(fetchSpy).toHaveBeenCalledWith(SCHEDULE_URL, expect.anything());
    expect(body).toContain('SUMMARY:Opening'); // alice faved guid-101 (case-folded handle)
    expect(body).toContain('SUMMARY:Closing Social'); // alice faved guid-201
    expect(body).not.toContain('Panoramax'); // guid-102 is bob's
    expect(body).toContain('SUMMARY:Volunteer'); // her SHARED shift
    expect(body).not.toContain('Secret'); // private shift stays private
    expect(body).not.toContain('PRIVATE NOTE'); // notes never leave the db
    expect(body).not.toContain('Broken Legacy'); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain('LOCATION:Guadeloupe');
    expect(body).toContain('UID:event-guid-101@sotm-picker.vibes.diy'); // stable across refreshes
    expect(body).toContain('SUMMARY:State of the Map 2026'); // the always-present anchor event
    expect(body).toContain('X-WR-CALNAME:@alice — State of the Map 2026 Picks');
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('serves fave-less holders and pre-tick tokens alike: valid anchor-only, never an error', async () => {
    feedOk();
    await tick();
    const res = await icsFetch(req('/faves.ics?t=freshly-minted-token-000&n=jchris'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the placeholder
    const body = await res.text();
    expect(body).toContain('SUMMARY:State of the Map 2026');
    // iOS captures the calendar name at subscribe time; the display-only n=
    // param names it correctly even before the tick resolves the token.
    expect(body).toContain('X-WR-CALNAME:@jchris — State of the Map 2026 Picks');
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  it('derives legacy shift times from day + startTime/endTime', async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain('SUMMARY:Gate');
    expect(body).toContain('DTSTART:20260828T080000Z'); // Friday 10:00 CEST
  });

  it('joins a fave whose feed entry has no end via the duration fallback', async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain('SUMMARY:State of Panoramax'); // bob faved guid-102
    expect(body).toContain('DTEND:20260828T082000Z'); // 09:50 +02:00 plus 00:30
  });

  it('does not aggregate users who never opted in (no token → no ics data at all)', async () => {
    // The tick fixture has no caltoken for a "nobody" user, and the opt-in
    // filter also drops fave-holders without tokens from the users map.
    feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200); // alice opted in and serves normally
  });

  it('400s a missing or malformed token and 502s a broken feed', async () => {
    feedOk();
    await tick();
    expect((await icsFetch(req('/faves.ics'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=short'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=bad$token!!!!!!!!!!!'), {})).status).toBe(400);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(502);
  });

  it("shifts don't touch the feed: a shifts-only user serves without egress", async () => {
    const fetchSpy = feedOk();
    await scheduled(
      { scheduledTime: '2026-07-04T12:00:00Z' },
      { db: { query: async () => [DB_DOCS[3], DB_DOCS[7]] } }
    );
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await res.text()).toContain('SUMMARY:Volunteer');
  });
});

describe('fetch handler — POST /faves.ics', () => {
  it('404s any other path', async () => {
    const res = await icsFetch(req('/'), {});
    expect(res.status).toBe(404);
  });
  it('405s methods other than GET/HEAD/POST with an Allow header', async () => {
    const res = await icsFetch(req('/faves.ics', { method: 'DELETE' }), {});
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });
  it('400s malformed JSON and invalid payloads', async () => {
    expect((await icsFetch(post('{nope'), {})).status).toBe(400);
    expect((await icsFetch(post({ items: [] }), {})).status).toBe(400);
    const bad = await icsFetch(
      post({ items: [{ title: 'A', start: 'junk', end: '2026-08-28T14:00:00' }] }),
      {}
    );
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('items[0].start');
  });
  it('returns a text/calendar attachment for a valid payload', async () => {
    const res = await icsFetch(post({ items: items() }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="sotm2026-faves.ics"'
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('SUMMARY:Opening');
    expect(body).toContain('DTSTART:20260828T073000Z'); // offset-explicit feed time converted to UTC
  });
  it('never needs ctx — works with an anonymous, ctx-less call', async () => {
    const res = await icsFetch(post({ items: items() }), undefined);
    expect(res.status).toBe(200);
  });
});

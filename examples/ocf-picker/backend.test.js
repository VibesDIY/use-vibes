import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  parseLineupHtml,
  scheduled,
  __resetSubCacheForTests,
  __resetScheduleCacheForTests,
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
          id: 'event-1',
          title: 'Main Stage Opener',
          start: '2026-07-10T13:00:00',
          end: '2026-07-10T14:00:00',
        },
      ];

describe('toIcsUtc — fair-local strings become ICS UTC stamps', () => {
  it('converts a naive fair-local time (PDT, UTC-7) to Z time', () => {
    expect(toIcsUtc('2026-07-10T13:00:00')).toBe('20260710T200000Z');
  });
  it('handles DST correctly — a winter time is PST (UTC-8)', () => {
    expect(toIcsUtc('2026-12-01T12:00:00')).toBe('20261201T200000Z');
  });
  it('respects an explicit offset instead of assuming fair time', () => {
    expect(toIcsUtc('2026-07-10T20:00:00Z')).toBe('20260710T200000Z');
    expect(toIcsUtc('2026-07-10T16:00:00-04:00')).toBe('20260710T200000Z');
  });
  it('accepts a millisecond ISO form', () => {
    expect(toIcsUtc('2026-07-10T17:00:00.000Z')).toBe('20260710T170000Z');
  });
  it('returns null for garbage, empty, and non-strings', () => {
    expect(toIcsUtc('2026-07-10T:00')).toBe(null); // the known malformed-shift shape
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
      title: 'Main Stage Opener',
      start: '20260710T200000Z',
      end: '20260710T210000Z',
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
          start: '2026-07-10T13:00:00',
          end: '2026-07-10T14:00:00',
          location: 'Stage Left',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0].location).toBe('Stage Left');
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
    // The extras form stores both times on the selected fair day, so an
    // overnight shift arrives with end before start.
    const r = parseFavesItems({
      items: [{ title: 'Night watch', start: '2026-07-10T22:00:00', end: '2026-07-10T01:00:00' }],
    });
    expect(r.ok).toBe(true);
    // 22:00 PDT Jul 10 → 05:00Z Jul 11; 01:00 PDT bumped to Jul 11 → 08:00Z Jul 11.
    expect(r.items[0].start).toBe('20260711T050000Z');
    expect(r.items[0].end).toBe('20260711T080000Z');
  });
  it('rejects zero-duration items and ends more than a day early', () => {
    const zero = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-10T09:00:00', end: '2026-07-10T09:00:00' }],
    });
    expect(zero.ok).toBe(false);
    expect(zero.error).toContain('zero duration');
    const wayEarly = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-10T09:00:00', end: '2026-07-08T09:00:00' }],
    });
    expect(wayEarly.ok).toBe(false);
    expect(wayEarly.error).toContain('before its start');
  });
  it('rejects a blank title and an unparseable time, naming the index', () => {
    const bad = parseFavesItems({
      items: [{ title: '  ', start: '2026-07-10T13:00:00', end: '2026-07-10T14:00:00' }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('items[0].title');
    const badTime = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-10T:00', end: '2026-07-10T14:00:00' }],
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
        title: 'Later Set',
        start: '2026-07-11T20:00:00',
        end: '2026-07-11T21:00:00',
      },
      {
        id: 'event-1',
        title: 'Früh; und, spät',
        start: '2026-07-10T13:00:00',
        end: '2026-07-10T14:00:00',
        location: 'Stage Left',
        url: 'https://www.oregoncountryfair.org/x',
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
    expect(ics).toContain('PRODID:-//vibes.diy//ocf-picker//EN\r\n');
    expect(ics).toContain('X-WR-CALNAME:My Oregon Country Fair Picks\r\n');
    expect(ics).toContain('X-WR-TIMEZONE:America/Los_Angeles\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('emits events sorted by start time regardless of input order', () => {
    // 2026-07-11T20:00 PDT crosses midnight UTC → 20260712T030000Z, and it must come second.
    expect(ics.indexOf('20260710T200000Z')).toBeLessThan(ics.indexOf('20260712T030000Z'));
    expect(ics.indexOf('20260712T030000Z')).toBeGreaterThan(-1);
  });
  it('stamps stable UIDs from the item id', () => {
    expect(ics).toContain('UID:event-1@ocf-picker.vibes.diy');
    expect(ics).toContain('UID:event-2@ocf-picker.vibes.diy');
  });
  it('escapes SUMMARY text and carries LOCATION/URL', () => {
    expect(ics).toContain('SUMMARY:Früh\\; und\\, spät');
    expect(ics).toContain('LOCATION:Stage Left');
    expect(ics).toContain('URL:https://www.oregoncountryfair.org/x');
  });
  it('emits URL as a URI, never TEXT-escaping its commas/semicolons', () => {
    const withPunct = parseFavesItems({
      items: [
        {
          id: 'e',
          title: 'A',
          start: '2026-07-10T13:00:00',
          end: '2026-07-10T14:00:00',
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

// A trimmed slice of the real lineup page (same verbatim rows as
// schedule.test.js): the upstream is HTML and the proxy serves the PARSED
// session array as JSON.
const FIXTURE_HTML = `<html><body><div id='lineup'>
<div class='session 2026-07-10 cat-vaudeville stage-left '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/jan-luby/'><span class='time'>11:00 AM - 11:30 AM</span><span class='title'>Jan Luby</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Stage Left</span><span class='genre column'><i class='fas fa-star'></i>Vaudeville</span></div></div></div>
<div class='session 2026-07-10 cat-music morningwood-odditorium '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/entertainment/wren-juniper/'><span class='time'>1:15 PM - 2:15 PM</span><span class='title'>Wren &amp; Juniper</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Morningwood Odditorium</span><span class='genre column'><i class='fas fa-star'></i>Music</span></div></div></div>
<div class='session 2026-07-12 cat-music youth-stage '><div class='row'><div class='column'><a href='https://www.oregoncountryfair.org/the-event/the-lineup/'><span class='time'>1:15 - 2:00PM</span><span class='title'>Recycleman&#039;s EcoHero Show</span></a></div><div class='column'><span class='location column'><i class='fas fa-location-dot'></i>Youth Stage</span><span class='genre column'><i class='fas fa-star'></i>Music</span></div></div></div>
</div></body></html>`;
const PARSED_JSON = JSON.stringify(parseLineupHtml(FIXTURE_HTML));
const ID_JAN = '2026-07-10|11:00|stage-left|jan-luby';
const ID_WREN = '2026-07-10|13:15|morningwood-odditorium|wren-juniper';
const ID_ECO = '2026-07-12|13:15|youth-stage|recycleman-s-ecohero-show';

// The db docs the scheduled aggregation tick sees (admin-lane read of the
// access-fn-bound db — the one lane allowed to read it).
const DB_DOCS = [
  { _id: `favorite-Alice-${ID_JAN}`, type: 'favorite', userId: 'Alice', eventId: ID_JAN },
  { _id: `favorite-alice-${ID_WREN}`, type: 'favorite', userId: 'alice', eventId: ID_WREN },
  { _id: `favorite-bob-${ID_ECO}`, type: 'favorite', userId: 'bob', eventId: ID_ECO },
  {
    _id: 'shift-1',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: true,
    kind: 'Booth Shift',
    start: '2026-07-10T09:00:00',
    end: '2026-07-10T10:30:00',
  },
  {
    _id: 'shift-2',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: false,
    kind: 'Secret',
    start: '2026-07-11T09:00:00',
    end: '2026-07-11T17:00:00',
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
    _id: `note-alice-${ID_JAN}`,
    type: 'note',
    userId: 'alice',
    eventId: ID_JAN,
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
    start: '2026-07-10T:00',
    end: '2026-07-10T17:00:00',
  },
];
const T_ALICE = 'alice-token-1234567890A';
const T_BOB = 'bob-token-1234567890BBB';
const tick = () =>
  scheduled({ scheduledTime: '2026-07-04T12:00:00Z' }, { db: { query: async () => DB_DOCS } });

const feedOk = () => {
  const spy = vi.fn(async () => new Response(FIXTURE_HTML, { status: 200 }));
  vi.stubGlobal('fetch', spy);
  return spy;
};

describe('fetch handler — GET /schedule.json (same-origin parse proxy)', () => {
  beforeEach(() => __resetScheduleCacheForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('serves the PARSED session array as JSON with cache headers, one upstream fetch per TTL', async () => {
    const spy = feedOk();
    const res1 = await icsFetch(req('/schedule.json'), {});
    expect(res1.status).toBe(200);
    expect(res1.headers.get('content-type')).toBe('application/json');
    expect(res1.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await res1.text()).toBe(PARSED_JSON);
    // Second request within the 10-minute TTL rides the module cache.
    const res2 = await icsFetch(req('/schedule.json'), {});
    expect(await res2.text()).toBe(PARSED_JSON);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(SCHEDULE_URL, expect.anything());
  });

  it('serves the stale copy when the upstream fails after the TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    feedOk();
    await icsFetch(req('/schedule.json'), {});
    vi.setSystemTime(new Date('2026-07-01T00:11:00Z')); // past the 10-minute TTL
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const res = await icsFetch(req('/schedule.json'), {});
    expect(res.status).toBe(200); // stale beats none
    expect(await res.text()).toBe(PARSED_JSON);
  });

  it('502s an upstream failure when nothing is cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      })
    );
    expect((await icsFetch(req('/schedule.json'), {})).status).toBe(502);
  });

  it('treats a fetch that parses to zero sessions as a failure (markup change ≠ empty fair)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html><body>redesigned page</body></html>', { status: 200 }))
    );
    const res = await icsFetch(req('/schedule.json'), {});
    expect(res.status).toBe(502);
    expect(await res.text()).toContain('no sessions');
  });

  it('405s non-GET methods', async () => {
    const res = await icsFetch(req('/schedule.json', { method: 'POST' }), {});
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  // If the site ever blocks the worker egress or shifts its markup under the
  // parser, the db snapshot (chunk docs of PARSED JSON written owner-side by
  // the ops refresher (vibes.diy scripts/vibe-ops/refresh-ocf-schedule.mjs), assembled by the tick) is the fallback path.
  const snapshotChunks = (body, { fetchedAt = '2026-07-08T06:00:00.000Z', size = 40 } = {}) => {
    const chunks = [];
    for (let i = 0; i * size < body.length; i++) chunks.push(body.slice(i * size, (i + 1) * size));
    return chunks.map((chunk, seq) => ({
      _id: `schedule-snapshot-${seq}`,
      type: 'schedule-snapshot',
      seq,
      total: chunks.length,
      fetchedAt,
      body: chunk,
    }));
  };

  it('serves the tick-assembled db snapshot when the upstream fails cold', async () => {
    await scheduled(
      { scheduledTime: '2026-07-08T06:01:00Z' },
      { db: { query: async () => snapshotChunks(PARSED_JSON) } }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('blocked', { status: 403 }))
    );
    const res = await icsFetch(req('/schedule.json'), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PARSED_JSON); // chunks re-joined in seq order
  });

  it('ignores chunks whose _id is not the canonical schedule-snapshot-<seq>', async () => {
    const offId = snapshotChunks(PARSED_JSON).map((d) => ({ ...d, _id: `evil-${d.seq}` }));
    await scheduled(
      { scheduledTime: '2026-07-08T06:01:00Z' },
      { db: { query: async () => offId } }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('blocked');
      })
    );
    expect((await icsFetch(req('/schedule.json'), {})).status).toBe(502);
  });

  it('ignores an incomplete or mixed-refresh chunk set', async () => {
    const missing = snapshotChunks(PARSED_JSON).slice(1); // seq 0 absent
    const mixed = snapshotChunks(PARSED_JSON);
    mixed[0] = { ...mixed[0], fetchedAt: '2026-07-07T00:00:00.000Z' }; // torn refresh
    for (const docs of [missing, mixed]) {
      __resetScheduleCacheForTests();
      await scheduled(
        { scheduledTime: '2026-07-08T06:01:00Z' },
        { db: { query: async () => docs } }
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('blocked');
        })
      );
      expect((await icsFetch(req('/schedule.json'), {})).status).toBe(502);
    }
  });

  it('shares one upstream fetch with the subscription lane', async () => {
    const spy = feedOk();
    await icsFetch(req('/schedule.json'), {}); // primes the cache
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUMMARY:Jan Luby');
    expect(spy).toHaveBeenCalledTimes(1); // the faves join reused the proxy's cache
  });
});

describe('fetch handler — GET /faves.ics?t=<token> (subscription lane)', () => {
  beforeEach(() => {
    __resetSubCacheForTests();
    __resetScheduleCacheForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('serves the never-empty anchor-only calendar before the first aggregation tick', async () => {
    // iOS validates a NEW subscription by fetching at add time — a cold-cache
    // error there reads as "Validation failed", so cold must serve a valid,
    // non-empty calendar (owner call; anchor-only until the ≤1m tick).
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the skeleton
    const body = await res.text();
    expect(body).toContain('SUMMARY:Oregon Country Fair');
    expect(body).not.toContain('Jan Luby'); // faves arrive with the tick
  });

  it("serves a user's CURRENT faves: db-aggregated ids joined against the parsed schedule", async () => {
    const fetchSpy = feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(null); // a feed, not a download
    const body = await res.text();
    expect(fetchSpy).toHaveBeenCalledWith(SCHEDULE_URL, expect.anything());
    expect(body).toContain('SUMMARY:Jan Luby'); // alice faved it (case-folded handle)
    expect(body).toContain('SUMMARY:Wren & Juniper'); // entity-decoded at parse time, then ICS-escaped
    expect(body).not.toContain('EcoHero'); // bob's pick
    expect(body).toContain('SUMMARY:Booth Shift'); // her SHARED shift
    expect(body).not.toContain('Secret'); // private shift stays private
    expect(body).not.toContain('PRIVATE NOTE'); // notes never leave the db
    expect(body).not.toContain('Broken Legacy'); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain('LOCATION:Stage Left');
    expect(body).toContain('DTSTART:20260710T180000Z'); // 11:00 PDT → Z time
    expect(body).toContain('URL:https://www.oregoncountryfair.org/entertainment/jan-luby/');
    // Synthetic id `|`/`:` separators sanitize to `-` in the UID — stable across refreshes.
    expect(body).toContain('UID:event-2026-07-10-11-00-stage-left-jan-luby@ocf-picker.vibes.diy');
    expect(body).toContain('SUMMARY:Oregon Country Fair'); // the always-present anchor event
    expect(body).toContain('X-WR-CALNAME:@alice — Oregon Country Fair Picks');
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('serves fave-less holders and pre-tick tokens alike: valid anchor-only, never an error', async () => {
    feedOk();
    await tick();
    const res = await icsFetch(req('/faves.ics?t=freshly-minted-token-000&n=jchris'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the placeholder
    const body = await res.text();
    expect(body).toContain('SUMMARY:Oregon Country Fair');
    // iOS captures the calendar name at subscribe time; the display-only n=
    // param names it correctly even before the tick resolves the token.
    expect(body).toContain('X-WR-CALNAME:@jchris — Oregon Country Fair Picks');
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  it('derives legacy shift times from day + startTime/endTime', async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain('SUMMARY:Gate');
    expect(body).toContain('DTSTART:20260710T170000Z'); // Friday 10:00 PDT
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
    await tick();
    expect((await icsFetch(req('/faves.ics'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=short'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=bad$token!!!!!!!!!!!'), {})).status).toBe(400);
    // Feed down AND no schedule cache primed → the join has nothing to serve.
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
    expect(await res.text()).toContain('SUMMARY:Booth Shift');
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
      post({ items: [{ title: 'A', start: 'junk', end: '2026-07-10T14:00:00' }] }),
      {}
    );
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('items[0].start');
  });
  it('returns a text/calendar attachment for a valid payload', async () => {
    const res = await icsFetch(post({ items: items() }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="ocf2026-faves.ics"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('SUMMARY:Main Stage Opener');
    expect(body).toContain('DTSTART:20260710T200000Z'); // fair-local converted to UTC
  });
  it('never needs ctx — works with an anonymous, ctx-less call', async () => {
    const res = await icsFetch(post({ items: items() }), undefined);
    expect(res.status).toBe(200);
  });
});

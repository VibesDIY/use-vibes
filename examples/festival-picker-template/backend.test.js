import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  scheduleItemsFor,
  scheduled,
  __resetSubCacheForTests,
  MAX_ITEMS,
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
          id: 'event-act-1',
          title: 'First Act',
          start: '2026-07-31T13:00:00',
          end: '2026-07-31T14:00:00',
        },
      ];

describe('toIcsUtc — festival-local strings become ICS UTC stamps', () => {
  it('converts a naive festival-local time (CDT, UTC-5) to Z time', () => {
    expect(toIcsUtc('2026-07-31T13:00:00')).toBe('20260731T180000Z');
  });
  it('handles DST correctly — a winter time is CST (UTC-6)', () => {
    expect(toIcsUtc('2026-12-01T12:00:00')).toBe('20261201T180000Z');
  });
  it('respects an explicit offset instead of assuming festival time', () => {
    expect(toIcsUtc('2026-07-31T20:00:00Z')).toBe('20260731T200000Z');
    expect(toIcsUtc('2026-07-31T16:00:00-04:00')).toBe('20260731T200000Z');
  });
  it("accepts the feed's space-separated form", () => {
    expect(toIcsUtc('2026-07-31 13:00:00')).toBe('20260731T180000Z');
  });
  it('returns null for garbage, empty, and non-strings', () => {
    expect(toIcsUtc('2026-07-30T:00')).toBe(null); // the known malformed-shift shape
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
      title: 'First Act',
      start: '20260731T180000Z',
      end: '20260731T190000Z',
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
          start: '2026-07-31T13:00:00',
          end: '2026-07-31T14:00:00',
          location: 'Main Stage',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0].location).toBe('Main Stage');
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
    // The extras form stores both times on the selected festival day, so an
    // overnight shift arrives with end before start (Codex P2 on #3255).
    const r = parseFavesItems({
      items: [{ title: 'Late shift', start: '2026-07-30T22:00:00', end: '2026-07-30T01:00:00' }],
    });
    expect(r.ok).toBe(true);
    // 22:00 CDT Jul 30 → 03:00Z Jul 31; 01:00 CDT bumped to Jul 31 → 06:00Z Jul 31.
    expect(r.items[0].start).toBe('20260731T030000Z');
    expect(r.items[0].end).toBe('20260731T060000Z');
  });
  it('rejects zero-duration items and ends more than a day early', () => {
    const zero = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-30T09:00:00', end: '2026-07-30T09:00:00' }],
    });
    expect(zero.ok).toBe(false);
    expect(zero.error).toContain('zero duration');
    const wayEarly = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-30T09:00:00', end: '2026-07-28T09:00:00' }],
    });
    expect(wayEarly.ok).toBe(false);
    expect(wayEarly.error).toContain('before its start');
  });
  it('rejects a blank title and an unparseable time, naming the index', () => {
    const bad = parseFavesItems({
      items: [{ title: '  ', start: '2026-07-31T13:00:00', end: '2026-07-31T14:00:00' }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('items[0].title');
    const badTime = parseFavesItems({
      items: [{ title: 'A', start: '2026-07-30T:00', end: '2026-07-31T14:00:00' }],
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
        title: 'Later Act',
        start: '2026-08-01T20:00:00',
        end: '2026-08-01T21:00:00',
      },
      {
        id: 'event-1',
        title: 'Früh; und, spät',
        start: '2026-07-31T13:00:00',
        end: '2026-07-31T14:00:00',
        location: 'Main Stage',
        url: 'https://example.com/artist/x',
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
    expect(ics).toContain('X-WR-CALNAME:My Pickathon Picks\r\n');
    expect(ics).toContain('X-WR-TIMEZONE:America/Chicago\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('emits events sorted by start time regardless of input order', () => {
    // 2026-08-01T20:00 CDT crosses midnight UTC → 20260802T010000Z, and it must come second.
    expect(ics.indexOf('20260731T180000Z')).toBeLessThan(ics.indexOf('20260802T010000Z'));
    expect(ics.indexOf('20260802T010000Z')).toBeGreaterThan(-1);
  });
  it('stamps stable UIDs from the item id', () => {
    expect(ics).toContain('UID:event-1@pickathon-picker.vibes.diy');
    expect(ics).toContain('UID:event-2@pickathon-picker.vibes.diy');
  });
  it('escapes SUMMARY text and carries LOCATION/URL', () => {
    expect(ics).toContain('SUMMARY:Früh\\; und\\, spät');
    expect(ics).toContain('LOCATION:Main Stage');
    expect(ics).toContain('URL:https://example.com/artist/x');
  });
  it('emits URL as a URI, never TEXT-escaping its commas/semicolons', () => {
    const withPunct = parseFavesItems({
      items: [
        {
          id: 'e',
          title: 'A',
          start: '2026-07-31T13:00:00',
          end: '2026-07-31T14:00:00',
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

describe('scheduleItemsFor — the embedded-snapshot join', () => {
  it('projects known ids into calendar items straight from the snapshot', () => {
    expect(scheduleItemsFor(['act-1'])).toEqual([
      {
        id: 'event-act-1',
        title: 'First Act',
        start: '2026-07-30T18:00:00',
        end: '2026-07-30T19:00:00',
        location: 'Main Stage',
        url: 'https://example.com/lineup',
      },
    ]);
  });
  it('drops ids the snapshot does not know (a stale favorite)', () => {
    expect(scheduleItemsFor(['act-gone'])).toEqual([]);
  });
});

// The db docs the scheduled aggregation tick sees (admin-lane read of the
// access-fn-bound db — the one lane allowed to read it). eventIds are snapshot
// keys now, not ids from a third-party feed.
const DB_DOCS = [
  { _id: 'favorite-Alice-act-1', type: 'favorite', userId: 'Alice', eventId: 'act-1' },
  // A favorite whose set is no longer in the snapshot — must drop out silently.
  { _id: 'favorite-alice-gone', type: 'favorite', userId: 'alice', eventId: 'act-gone' },
  { _id: 'favorite-bob-act-2', type: 'favorite', userId: 'bob', eventId: 'act-2' },
  {
    _id: 'shift-1',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: true,
    kind: 'Volunteer',
    start: '2026-07-30T09:00:00',
    end: '2026-07-30T17:00:00',
  },
  {
    _id: 'shift-2',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: false,
    kind: 'Secret',
    start: '2026-07-31T09:00:00',
    end: '2026-07-31T17:00:00',
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
    _id: 'note-alice-act-1',
    type: 'note',
    userId: 'alice',
    eventId: 'act-1',
    notes: 'PRIVATE NOTE',
  },
  // Opt-in capability tokens (auto-minted client-side on the schedule tab).
  { _id: 'caltoken-alice', type: 'caltoken', userId: 'alice', token: 'alice-token-1234567890A' },
  { _id: 'caltoken-bob', type: 'caltoken', userId: 'bob', token: 'bob-token-1234567890BBB' },
  // The known legacy malformed shape (cleared time input persisted as `<date>T:00`),
  // SHARED — must drop out of alice's feed without 400ing it (Charlie, #3258).
  {
    _id: 'shift-broken',
    type: 'shift',
    userId: 'alice',
    shareWithFriends: true,
    kind: 'Broken Legacy',
    start: '2026-07-30T:00',
    end: '2026-07-30T17:00:00',
  },
];
const doc = (id) => DB_DOCS.find((d) => d._id === id);
const T_ALICE = 'alice-token-1234567890A';
const T_BOB = 'bob-token-1234567890BBB';
const tickWith = (docs) =>
  scheduled({ scheduledTime: '2026-07-04T12:00:00Z' }, { db: { query: async () => docs } });
const tick = () => tickWith(DB_DOCS);

describe('fetch handler — GET /faves.ics?t=<token> (subscription lane)', () => {
  beforeEach(() => __resetSubCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('serves the never-empty anchor-only calendar before the first aggregation tick', async () => {
    // iOS validates a NEW subscription by fetching at add time — a cold-cache
    // error there reads as "Validation failed", so cold must serve a valid,
    // non-empty calendar (owner call; anchor-only until the ≤1m tick).
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the skeleton
    const body = await res.text();
    expect(body).toContain('SUMMARY:Gates Open');
    expect(body).not.toContain('First Act'); // faves arrive with the tick
  });

  it("serves a user's CURRENT faves: db-aggregated ids joined against the snapshot", async () => {
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(null); // a feed, not a download
    const body = await res.text();
    expect(body).toContain('SUMMARY:First Act'); // alice faved act-1 (case-folded handle)
    expect(body).not.toContain('Second Act'); // act-2 is bob's
    expect(body).toContain('SUMMARY:Volunteer'); // her SHARED shift
    expect(body).not.toContain('Secret'); // private shift stays private
    expect(body).not.toContain('PRIVATE NOTE'); // notes never leave the db
    expect(body).not.toContain('Broken Legacy'); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain('LOCATION:Main Stage');
    expect(body).toContain('UID:event-act-1@pickathon-picker.vibes.diy'); // stable across refreshes
    expect(body).toContain('SUMMARY:Gates Open'); // the always-present anchor event
    expect(body).toContain('X-WR-CALNAME:@alice — Pickathon Picks');
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('drops a favorite the snapshot no longer lists instead of failing the feed', async () => {
    // alice also faves `act-gone`; her calendar is anchor + act-1 + her shift.
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).text();
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(3);
  });

  it('serves the whole feed without any egress — the snapshot replaced the fetch', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await res.text()).toContain('SUMMARY:First Act');
  });

  it('serves fave-less holders and pre-tick tokens alike: valid anchor-only, never an error', async () => {
    await tick();
    const res = await icsFetch(req('/faves.ics?t=freshly-minted-token-000&n=jchris'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the placeholder
    const body = await res.text();
    expect(body).toContain('SUMMARY:Gates Open');
    // iOS captures the calendar name at subscribe time; the display-only n=
    // param names it correctly even before the tick resolves the token.
    expect(body).toContain('X-WR-CALNAME:@jchris — Pickathon Picks');
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  it('derives legacy shift times from day + startTime/endTime, using the snapshot dates', async () => {
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain('SUMMARY:Gate');
    expect(body).toContain('DTSTART:20260731T150000Z'); // Friday (2026-07-31) 10:00 CDT
  });

  it('does not aggregate users who never opted in (no token → no ics data at all)', async () => {
    // The tick fixture has no caltoken for a "nobody" user, and the opt-in
    // filter also drops fave-holders without tokens from the users map.
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200); // alice opted in and serves normally
  });

  it('400s a missing or malformed token', async () => {
    await tick();
    expect((await icsFetch(req('/faves.ics'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=short'), {})).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=bad$token!!!!!!!!!!!'), {})).status).toBe(400);
  });

  it('serves a shifts-only user (no favorites at all)', async () => {
    await tickWith([doc('shift-1'), doc('caltoken-alice')]);
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
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
      post({ items: [{ title: 'A', start: 'junk', end: '2026-07-31T14:00:00' }] }),
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
      'attachment; filename="pickathon-faves.ics"'
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('SUMMARY:First Act');
    expect(body).toContain('DTSTART:20260731T180000Z'); // festival-local converted to UTC
  });
  it('never needs ctx — works with an anonymous, ctx-less call', async () => {
    const res = await icsFetch(post({ items: items() }), undefined);
    expect(res.status).toBe(200);
  });
});

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  decodeFeedEntities,
  scheduled,
  __resetSubCacheForTests,
  __resetScheduleSyncForTests,
  __resetHeartbeatForTests,
  __resetShedForTests,
  LOADSHED_ID,
  LOADSHED_TYPE,
  SHED_RETRY_AFTER_SECONDS,
  HEARTBEAT_ID,
  HEARTBEAT_TYPE,
  HEARTBEAT_INTERVAL_MS,
  SCHEDULE_STATE_ID,
  SCHEDULE_STATE_TYPE,
  SCHEDULE_SYNC_INTERVAL_MS,
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
          title: 'Built to Spill',
          start: '2026-07-31T13:00:00',
          end: '2026-07-31T14:00:00',
        },
      ];

describe('toIcsUtc — festival-local strings become ICS UTC stamps', () => {
  it('converts a naive festival-local time (PDT, UTC-7) to Z time', () => {
    expect(toIcsUtc('2026-07-31T13:00:00')).toBe('20260731T200000Z');
  });
  it('handles DST correctly — a winter time is PST (UTC-8)', () => {
    expect(toIcsUtc('2026-12-01T12:00:00')).toBe('20261201T200000Z');
  });
  it('respects an explicit offset instead of assuming festival time', () => {
    expect(toIcsUtc('2026-07-31T20:00:00Z')).toBe('20260731T200000Z');
    expect(toIcsUtc('2026-07-31T16:00:00-04:00')).toBe('20260731T200000Z');
  });
  it("accepts the feed's space-separated form", () => {
    expect(toIcsUtc('2026-07-31 13:00:00')).toBe('20260731T200000Z');
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
      title: 'Built to Spill',
      start: '20260731T200000Z',
      end: '20260731T210000Z',
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
          location: 'Woods Stage',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0].location).toBe('Woods Stage');
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
    // 22:00 PDT Jul 30 → 05:00Z Jul 31; 01:00 PDT bumped to Jul 31 → 08:00Z Jul 31.
    expect(r.items[0].start).toBe('20260731T050000Z');
    expect(r.items[0].end).toBe('20260731T080000Z');
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
        location: 'Woods Stage',
        url: 'https://pickathon.com/artist/x',
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
    expect(ics).toContain('X-WR-TIMEZONE:America/Los_Angeles\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('emits events sorted by start time regardless of input order', () => {
    // 2026-08-01T20:00 PDT crosses midnight UTC → 20260802T030000Z, and it must come second.
    expect(ics.indexOf('20260731T200000Z')).toBeLessThan(ics.indexOf('20260802T030000Z'));
    expect(ics.indexOf('20260802T030000Z')).toBeGreaterThan(-1);
  });
  it('stamps stable UIDs from the item id', () => {
    expect(ics).toContain('UID:event-1@pickathon-picker.vibes.diy');
    expect(ics).toContain('UID:event-2@pickathon-picker.vibes.diy');
  });
  it('escapes SUMMARY text and carries LOCATION/URL', () => {
    expect(ics).toContain('SUMMARY:Früh\\; und\\, spät');
    expect(ics).toContain('LOCATION:Woods Stage');
    expect(ics).toContain('URL:https://pickathon.com/artist/x');
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

// The feed shape schedule.php actually returns: venues keyed by id, each with
// a title and an events array.
const FEED = {
  12: {
    title: 'Woods Stage',
    events: [
      {
        id: 101,
        title: 'Built to Spill',
        start: '2026-07-31 13:00:00',
        end: '2026-07-31 14:00:00',
        url: 'https://pickathon.com/a',
      },
      {
        id: 102,
        title: 'Skills &amp; Games',
        start: '2026-08-01 11:00:00',
        end: '2026-08-01 12:00:00',
      },
    ],
  },
  13: {
    title: 'Galaxy Barn',
    events: [
      { id: 201, title: 'Night Act', start: '2026-08-01 23:00:00', end: '2026-08-02 00:30:00' },
    ],
  },
};

describe('decodeFeedEntities', () => {
  it("decodes the feed's HTML entities without a DOM", () => {
    expect(decodeFeedEntities('Skills &amp; Games')).toBe('Skills & Games');
    expect(decodeFeedEntities('caf&#233; &#x1F3B8;')).toBe('café 🎸');
    expect(decodeFeedEntities('keep &unknown; as-is')).toBe('keep &unknown; as-is');
  });
});

// The db docs the scheduled aggregation tick sees (admin-lane read of the
// access-fn-bound db — the one lane allowed to read it).
const DB_DOCS = [
  { _id: 'favorite-Alice-101', type: 'favorite', userId: 'Alice', eventId: 101 },
  { _id: 'favorite-alice-201', type: 'favorite', userId: 'alice', eventId: '201' },
  { _id: 'favorite-bob-102', type: 'favorite', userId: 'bob', eventId: 102 },
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
  { _id: 'note-alice-101', type: 'note', userId: 'alice', eventId: '101', notes: 'PRIVATE NOTE' },
  // Opt-in capability tokens (auto-minted client-side on the schedule tab).
  { _id: 'caltoken-alice', type: 'caltoken', userId: 'Alice', token: 'alice-token-1234567890A' },
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
const T_ALICE = 'alice-token-1234567890A';
const T_BOB = 'bob-token-1234567890BBB';
const tick = () =>
  scheduled({ scheduledTime: '2026-07-04T12:00:00Z' }, { db: { query: async () => DB_DOCS } });

describe('fetch handler — GET /faves.ics?u=<handle> (subscription lane)', () => {
  beforeEach(() => {
    __resetSubCacheForTests();
    __resetShedForTests();
  });
  afterEach(() => vi.unstubAllGlobals());
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  };

  it('serves the never-empty anchor-only calendar before the first aggregation tick', async () => {
    // iOS validates a NEW subscription by fetching at add time — a cold-cache
    // error there reads as "Validation failed", so cold must serve a valid,
    // non-empty calendar (owner call; anchor-only until the ≤1m tick).
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the skeleton
    const body = await res.text();
    expect(body).toContain('SUMMARY:Gates Open');
    expect(body).not.toContain('Built to Spill'); // faves arrive with the tick
  });

  it("serves a user's CURRENT faves: db-aggregated ids joined live against the feed", async () => {
    const fetchSpy = feedOk();
    await tick();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(null); // a feed, not a download
    const body = await res.text();
    expect(fetchSpy).toHaveBeenCalledWith(SCHEDULE_URL, expect.anything());
    expect(body).toContain('SUMMARY:Built to Spill'); // alice faved 101 (case-folded handle)
    expect(body).toContain('SUMMARY:Night Act'); // alice faved 201
    expect(body).not.toContain('Skills'); // 102 is bob's
    expect(body).toContain('SUMMARY:Volunteer'); // her SHARED shift
    expect(body).not.toContain('Secret'); // private shift stays private
    expect(body).not.toContain('PRIVATE NOTE'); // notes never leave the db
    expect(body).not.toContain('Broken Legacy'); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain('LOCATION:Woods Stage');
    expect(body).toContain('UID:event-101@pickathon-picker.vibes.diy'); // stable across refreshes
    expect(body).toContain('SUMMARY:Gates Open'); // the always-present anchor event
    expect(body).toContain('X-WR-CALNAME:@alice — Pickathon Picks');
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('serves fave-less holders and pre-tick tokens alike: valid anchor-only, never an error', async () => {
    feedOk();
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

  it('derives legacy shift times from day + startTime/endTime', async () => {
    feedOk();
    await tick();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), {})).text();
    expect(body).toContain('SUMMARY:Gate');
    expect(body).toContain('DTSTART:20260731T170000Z'); // Friday 10:00 PDT
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
    expect(body).toContain('SUMMARY:Built to Spill');
    expect(body).toContain('DTSTART:20260731T200000Z'); // festival-local converted to UTC
  });
  it('never needs ctx — works with an anonymous, ctx-less call', async () => {
    const res = await icsFetch(post({ items: items() }), undefined);
    expect(res.status).toBe(200);
  });
});

// ── The schedule mirror: what #4293 was actually about ───────────────────────
// The tick's db read is capped by the host at 2000 docs sorted by _id, and this
// db passed that. `schedule-event-*` sorts last, so the mirror's own docs became
// invisible to the tick — it re-put all ~330 of them every 60 seconds and pinned
// the Durable Object at 97% occupancy. These tests pin the shape that fixed it:
// the mirror decides "unchanged" from its own state doc, which is reachable at
// any db size, so a steady schedule costs ZERO writes.
describe('schedule mirror — unchanged schedule must cost zero writes', () => {
  beforeEach(() => {
    __resetSubCacheForTests();
    __resetScheduleSyncForTests();
    __resetHeartbeatForTests();
    __resetShedForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  // A ctx that records every write and replays the docs a capped read returns.
  const mkCtx = (docs = []) => {
    const store = new Map(docs.map((d) => [d._id, d]));
    const puts = [];
    const deletes = [];
    return {
      puts,
      deletes,
      docs: () => [...store.values()],
      db: {
        query: async () => [...store.values()],
        put: async (doc) => {
          puts.push(doc);
          store.set(doc._id, doc);
          return doc._id;
        },
        delete: async (id) => {
          deletes.push(id);
          store.delete(id);
          return id;
        },
      },
    };
  };
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  };
  // Successive ticks, SCHEDULE_SYNC_INTERVAL_MS apart so each one is due.
  const at = (n) => ({ scheduledTime: new Date(1e12 + n * SCHEDULE_SYNC_INTERVAL_MS).toISOString() });

  it('mirrors the feed on the first sync and records a fingerprint per event', async () => {
    feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    const items = ctx.puts.filter((d) => d.type === 'scheduleitem');
    expect(items.map((d) => d._id).sort()).toEqual([
      'schedule-event-101',
      'schedule-event-102',
      'schedule-event-201',
    ]);
    const state = ctx.puts.find((d) => d._id === SCHEDULE_STATE_ID);
    expect(state.type).toBe(SCHEDULE_STATE_TYPE);
    expect(Object.keys(state.fingerprints).sort()).toEqual(items.map((d) => d._id).sort());
  });

  it('writes NOTHING on a later sync of an unchanged schedule (the #4293 regression)', async () => {
    feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    const afterFirst = ctx.puts.length;
    await scheduled(at(1), ctx);
    await scheduled(at(2), ctx);
    expect(ctx.puts.length).toBe(afterFirst);
    expect(ctx.deletes).toEqual([]);
  });

  it('stays quiet even when the capped read cannot see the schedule docs at all', async () => {
    // Prod's exact shape: the read returns the state doc (its _id leads with a
    // digit, so it sorts to the front and survives the cap) but NOT one single
    // `schedule-event-*` doc. This is the case that used to re-put everything.
    feedOk();
    const seed = mkCtx(DB_DOCS);
    await scheduled(at(0), seed);
    const state = seed.puts.find((d) => d._id === SCHEDULE_STATE_ID);
    const capped = mkCtx([...DB_DOCS, state]); // no scheduleitem docs survive the cap
    await scheduled(at(1), capped);
    expect(capped.puts).toEqual([]);
    expect(capped.deletes).toEqual([]);
  });

  it('falls back to the in-isolate copy when the state doc is not in the read', async () => {
    // The state doc's _id sorts ahead of everything this app mints, but _id is a
    // free string — enough docs beginning with punctuation would evict it, and a
    // signed-in stranger can write those (unknown types are accepted, just routed
    // to `discard`). Losing it must NOT read as "nothing is mirrored".
    feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    ctx.puts.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Same isolate, but the read no longer contains the state doc.
    const evicted = {
      db: { ...ctx.db, query: async () => ctx.docs().filter((d) => d._id !== SCHEDULE_STATE_ID) },
    };
    await scheduled(at(1), evicted);
    expect(ctx.puts).toEqual([]); // the isolate remembered — no rewrite storm
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing from the db read'));
    warn.mockRestore();
  });

  it('re-puts ONLY the event whose content changed', async () => {
    feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    ctx.puts.length = 0;
    const moved = JSON.parse(JSON.stringify(FEED));
    moved[12].events[0].start = '2026-07-31 15:00:00';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(moved), { status: 200 }))
    );
    await scheduled(at(1), ctx);
    expect(ctx.puts.filter((d) => d.type === 'scheduleitem').map((d) => d._id)).toEqual([
      'schedule-event-101',
    ]);
    expect(ctx.puts.some((d) => d._id === SCHEDULE_STATE_ID)).toBe(true);
  });

  it('deletes an event that vanished from the feed, from state alone', async () => {
    feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    ctx.puts.length = 0;
    const shrunk = JSON.parse(JSON.stringify(FEED));
    shrunk[13].events = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(shrunk), { status: 200 }))
    );
    await scheduled(at(1), ctx);
    expect(ctx.deletes).toEqual(['schedule-event-201']);
  });

  it('does not even fetch the feed on a tick inside the sync interval', async () => {
    const spy = feedOk();
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    // A minute later: the aggregate still refreshes, the feed is left alone.
    await scheduled({ scheduledTime: new Date(1e12 + 60_000).toISOString() }, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed or empty feed writes nothing and retries on the next tick', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ctx = mkCtx(DB_DOCS);
    await scheduled(at(0), ctx);
    // The liveness heartbeat is deliberately independent of the feed — a tick
    // that ran and found the upstream down is still a tick that ran.
    expect(ctx.puts.filter((d) => d.type !== HEARTBEAT_TYPE)).toEqual([]);
    expect(ctx.deletes).toEqual([]);
    // The gate did not advance, so the very next tick tries again.
    const spy = feedOk();
    await scheduled({ scheduledTime: new Date(1e12 + 60_000).toISOString() }, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ctx.puts.filter((d) => d.type === 'scheduleitem').length).toBe(3);
  });

  it('treats a corrupt or forged state doc as "nothing mirrored", never as up to date', async () => {
    feedOk();
    const ctx = mkCtx([
      ...DB_DOCS,
      { _id: SCHEDULE_STATE_ID, type: SCHEDULE_STATE_TYPE, fingerprints: 'not-an-object' },
    ]);
    await scheduled(at(0), ctx);
    expect(ctx.puts.filter((d) => d.type === 'scheduleitem').length).toBe(3);
  });

  it('warns when the db read comes back capped, because the host says nothing', async () => {
    feedOk();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const filler = Array.from({ length: 2000 }, (_, i) => ({
      _id: `favorite-user${String(i).padStart(5, '0')}-1`,
      type: 'favorite',
      userId: `user${i}`,
      eventId: 101,
    }));
    await scheduled(at(0), mkCtx(filler));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2000-doc query cap'));
    warn.mockRestore();
  });
});

describe('tick liveness heartbeat — the only durable proof the alarm ran', () => {
  beforeEach(() => {
    __resetSubCacheForTests();
    __resetScheduleSyncForTests();
    __resetHeartbeatForTests();
    __resetShedForTests();
    // The feed is irrelevant here; a down upstream keeps the mirror out of the puts.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const mkCtx = (docs = []) => {
    const puts = [];
    return {
      puts,
      db: { query: async () => docs, put: async (d) => puts.push(d), delete: async () => {} },
    };
  };
  const beats = (ctx) => ctx.puts.filter((d) => d.type === HEARTBEAT_TYPE);
  const tick = (ms) => ({ scheduledTime: new Date(ms).toISOString() });
  const T0 = 1e12;

  it('stamps the tick’s scheduled time on a cold isolate with no doc to go by', async () => {
    const ctx = mkCtx([]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toEqual([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0).toISOString() },
    ]);
  });

  it('beats at most once an hour — a 1m tick must not mint a write a minute', async () => {
    const ctx = mkCtx([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + 60_000), ctx);
    await scheduled(tick(T0 + HEARTBEAT_INTERVAL_MS - 1000), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('re-beats once the interval elapses, with a CHANGED stamp (or the platform dedupes it)', async () => {
    const ctx = mkCtx([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + HEARTBEAT_INTERVAL_MS), ctx);
    const stamps = beats(ctx).map((d) => d.at);
    expect(stamps).toHaveLength(2);
    expect(stamps[0]).not.toBe(stamps[1]);
  });

  it('honours a recent heartbeat doc from the read after an isolate restart', async () => {
    // Fresh isolate (no memory), but the doc is right there in the whole-db read
    // its digit-leading _id guarantees a seat in — so nothing is due.
    const ctx = mkCtx([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0 - 60_000).toISOString() },
    ]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toEqual([]);
  });

  it('beats when the doc in the read is stale — a dead-then-revived alarm says so', async () => {
    const ctx = mkCtx([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0 - 3 * 60 * 60 * 1000).toISOString() },
    ]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('a doc missing from a capped read means "don’t know", never "never beat"', async () => {
    // The #4293 shape: losing the doc from the read must not restart the writes.
    const ctx = mkCtx([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + 60_000), mkCtx([])); // same isolate, doc absent
    expect(beats(ctx)).toHaveLength(1);
  });

  it('treats an unparseable stamp as no evidence and beats now', async () => {
    const ctx = mkCtx([{ _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: 'not-a-date' }]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('writes nothing on a read-only ctx (the ics GET lane shares this isolate)', async () => {
    await expect(scheduled(tick(T0), { db: { query: async () => [] } })).resolves.not.toThrow();
  });
});

describe('load shedding — the owner-flipped config doc', () => {
  beforeEach(() => {
    __resetSubCacheForTests();
    __resetScheduleSyncForTests();
    __resetHeartbeatForTests();
    __resetShedForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  };
  const shedDoc = (level) => ({ _id: LOADSHED_ID, type: LOADSHED_TYPE, level });
  const mkCtx = (docs = []) => {
    const puts = [];
    const deletes = [];
    let rows = docs;
    return {
      puts,
      deletes,
      setDocs: (d) => {
        rows = d;
      },
      db: {
        query: async () => rows,
        put: async (d) => {
          puts.push(d);
          return d._id;
        },
        delete: async (id) => {
          deletes.push(id);
          return id;
        },
      },
    };
  };
  const at = (n) => ({ scheduledTime: new Date(1e12 + n * SCHEDULE_SYNC_INTERVAL_MS).toISOString() });

  it('serves the subscription normally when the doc is absent (fail-open)', async () => {
    feedOk();
    await scheduled(at(0), mkCtx(DB_DOCS));
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUMMARY:Built to Spill');
  });

  it('serves normally when the level is off or unrecognized (a typo must not shed)', async () => {
    feedOk();
    await scheduled(at(0), mkCtx([...DB_DOCS, shedDoc('off')]));
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(200);
    await scheduled(at(1), mkCtx([...DB_DOCS, shedDoc('readonly')])); // fat-fingered
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(200);
  });

  it('503s the subscription lane with a retry-after while shedding, in BOTH shed levels', async () => {
    // Calendar clients retry a 503 gracefully and keep the events they already
    // synced — which is why this is a 503 and not an empty calendar.
    for (const level of ['read-only', 'schedule-only']) {
      __resetShedForTests();
      __resetSubCacheForTests();
      feedOk();
      await scheduled(at(0), mkCtx([...DB_DOCS, shedDoc(level)]));
      const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
      expect(res.status).toBe(503);
      expect(res.headers.get('retry-after')).toBe(String(SHED_RETRY_AFTER_SECONDS));
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.text();
      expect(body).toMatch(/festival/i); // calm, and says it comes back
      expect(body).not.toMatch(/error|lost|deleted/i);
    }
  });

  it('a malformed token still 400s before the shed check (shedding is not a bug bucket)', async () => {
    feedOk();
    await scheduled(at(0), mkCtx([...DB_DOCS, shedDoc('read-only')]));
    expect((await icsFetch(req('/faves.ics?t=short'), {})).status).toBe(400);
  });

  it('skips the aggregate while shedding but STILL writes the heartbeat', async () => {
    // Liveness must survive shedding: a shed tick is still a tick that ran, and
    // the heartbeat is the only durable evidence of that (#4305).
    feedOk();
    const ctx = mkCtx([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    expect(ctx.puts.filter((d) => d.type === HEARTBEAT_TYPE)).toHaveLength(1);
    // No aggregate was built, so the GET has nothing to serve even if it tried.
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(503);
  });

  it('keeps the 5-minute schedule mirror running in BOTH shed levels', async () => {
    // Shedding targets viewer-driven amplification, not the fixed-cost mirror —
    // and the schedule staying fresh is the whole point of staying up.
    for (const level of ['read-only', 'schedule-only']) {
      __resetShedForTests();
      __resetScheduleSyncForTests();
      feedOk();
      const ctx = mkCtx([...DB_DOCS, shedDoc(level)]);
      await scheduled(at(0), ctx);
      expect(ctx.puts.filter((d) => d.type === 'scheduleitem').length).toBe(3);
      expect(ctx.puts.some((d) => d._id === SCHEDULE_STATE_ID)).toBe(true);
    }
  });

  it('honours the in-isolate copy when the doc falls out of a capped read', async () => {
    // §4a: a missing doc means "don't know" → use the remembered level. It must
    // never read as "shedding is off", which would re-open the very load spike
    // the switch was flipped for.
    feedOk();
    const ctx = mkCtx([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ctx.setDocs(DB_DOCS); // same isolate, the config doc is no longer in the read
    await scheduled(at(1), ctx);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(503);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(LOADSHED_ID));
    warn.mockRestore();
  });

  it('lifts the shed as soon as the doc says off, and re-fills the aggregate', async () => {
    feedOk();
    const ctx = mkCtx([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {})).status).toBe(503);
    ctx.setDocs([...DB_DOCS, shedDoc('off')]);
    await scheduled(at(1), ctx);
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUMMARY:Built to Spill');
  });

  it('a cold isolate that has never seen the doc serves normally (fail-open)', async () => {
    // The GET lane cannot read the db at all, so before the first tick it has no
    // idea whether we are shedding. Fail-open is the only safe default.
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), {});
    expect(res.status).toBe(200);
  });
});

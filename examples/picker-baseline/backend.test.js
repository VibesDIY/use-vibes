import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  BACKEND_DB,
  FESTIVAL_NAME,
  ICS_SLUG,
  toIcsUtc,
  escapeIcsText,
  foldIcsLine,
  parseFavesItems,
  buildFavesCalendar,
  decodeFeedEntities,
  scheduled,
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
  fetchScheduleItems,
  scheduleItemId,
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
    expect(ics).toContain(`X-WR-CALNAME:My ${FESTIVAL_NAME} Picks\r\n`);
    expect(ics).toContain('X-WR-TIMEZONE:America/Los_Angeles\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('emits events sorted by start time regardless of input order', () => {
    // 2026-08-01T20:00 PDT crosses midnight UTC → 20260802T030000Z, and it must come second.
    expect(ics.indexOf('20260731T200000Z')).toBeLessThan(ics.indexOf('20260802T030000Z'));
    expect(ics.indexOf('20260802T030000Z')).toBeGreaterThan(-1);
  });
  it('stamps stable UIDs from the item id', () => {
    expect(ics).toContain(`UID:event-1@${ICS_SLUG}.vibes.diy`);
    expect(ics).toContain(`UID:event-2@${ICS_SLUG}.vibes.diy`);
  });
  it('escapes SUMMARY text and carries LOCATION/URL', () => {
    expect(ics).toContain('SUMMARY:Früh\\; und\\, spät');
    expect(ics).toContain('LOCATION:Woods Stage');
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
        url: 'https://example.com/a',
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

// ── A stand-in for the host's read lane (#4398) ──────────────────────────────
// Faithful on the four things this app's correctness now rests on:
//   · docs come back ordered by `_id`, cut at the page limit;
//   · `after` is an EXCLUSIVE keyset cursor on `_id`;
//   · `field`/`key`/`keys` filter AFTER the page is cut — so a full page can
//     arrive here empty;
//   · `next` is set from the RAW page (full ⇒ cursor), NOT from what survived
//     the filter, and rides as a non-enumerable property on a real Array.
// A fake that filtered before cutting would make the paginating code below look
// correct when it isn't, which is the whole bug class this test file exists for.
const PAGE_CAP = 2000;
const mkDb = (docs = []) => {
  const store = new Map(docs.map((d) => [d._id, d]));
  const puts = [];
  const deletes = [];
  const queries = [];
  return {
    puts,
    deletes,
    queries,
    docs: () => [...store.values()],
    setDocs: (list) => {
      store.clear();
      for (const d of list) store.set(d._id, d);
    },
    db: {
      query: async (opts = {}) => {
        queries.push(opts);
        const limit = Math.max(1, Math.min(opts.limit ?? PAGE_CAP, PAGE_CAP));
        const page = [...store.values()]
          .sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0))
          .filter((d) => (typeof opts.after === 'string' ? d._id > opts.after : true))
          .slice(0, limit);
        const next = page.length === limit ? page[page.length - 1]._id : undefined;
        let rows = page;
        if (opts.field !== undefined) {
          const keys = opts.keys ?? (opts.key !== undefined ? [opts.key] : null);
          if (keys !== null) rows = page.filter((d) => keys.includes(d[opts.field]));
        }
        const out = [...rows];
        if (next !== undefined) {
          Object.defineProperty(out, 'next', { value: next, enumerable: false });
        }
        Object.defineProperty(out, 'docs', { value: out, enumerable: false });
        return out;
      },
      get: async (id) => store.get(id) ?? null,
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

// The mirrored schedule docs the scheduled tick writes — one `scheduleitem` per
// event. The GET lane resolves faved event ids against THESE (a point get per
// id), NOT a per-request egress to the festival site. Titles/venues arrive already
// entity-decoded and times already T-normalized, exactly as the tick stores them.
const SCHEDULE_DOCS = [
  {
    _id: 'schedule-event-101',
    type: 'scheduleitem',
    eventId: 101,
    title: 'Built to Spill',
    start: '2026-07-31T13:00:00',
    end: '2026-07-31T14:00:00',
    venueTitle: 'Woods Stage',
    url: 'https://example.com/a',
    lineup: {},
  },
  {
    _id: 'schedule-event-102',
    type: 'scheduleitem',
    eventId: 102,
    title: 'Skills & Games',
    start: '2026-08-01T11:00:00',
    end: '2026-08-01T12:00:00',
    venueTitle: 'Woods Stage',
    lineup: {},
  },
  {
    _id: 'schedule-event-201',
    type: 'scheduleitem',
    eventId: 201,
    title: 'Night Act',
    start: '2026-08-01T23:00:00',
    end: '2026-08-02T00:30:00',
    venueTitle: 'Galaxy Barn',
    lineup: {},
  },
];

// The db docs the subscription lane reads at request time (the fetch lane reads
// this db directly — config.fetch.unfilteredReads, #3650). SCHEDULE_DOCS are
// appended LAST so the positional indexes used below (DB_DOCS[3], [7]) hold.
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
  ...SCHEDULE_DOCS,
];
const T_ALICE = 'alice-token-1234567890A';
const T_BOB = 'bob-token-1234567890BBB';

describe('fetch handler — GET /faves.ics?t=<token> (subscription lane)', () => {
  beforeEach(() => {
    __resetShedForTests();
  });
  afterEach(() => vi.unstubAllGlobals());
  const feedOk = () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  };

  it("serves a user's CURRENT faves: read at request time, joined against the mirrored schedule docs", async () => {
    const fetchSpy = feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), mkDb(DB_DOCS));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(null); // a feed, not a download
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = await res.text();
    expect(fetchSpy).not.toHaveBeenCalled(); // NO per-request egress — reads the mirror
    expect(body).toContain('SUMMARY:Built to Spill'); // alice faved 101 (case-folded handle)
    expect(body).toContain('SUMMARY:Night Act'); // alice faved 201
    expect(body).not.toContain('Skills'); // 102 is bob's
    expect(body).toContain('SUMMARY:Volunteer'); // her SHARED shift
    expect(body).not.toContain('Secret'); // private shift stays private
    expect(body).not.toContain('PRIVATE NOTE'); // notes never leave the db
    expect(body).not.toContain('Broken Legacy'); // malformed shared shift drops out, doesn't 400 the feed
    expect(body).toContain('LOCATION:Woods Stage');
    expect(body).toContain(`UID:event-101@${ICS_SLUG}.vibes.diy`); // stable across refreshes
    expect(body).toContain('SUMMARY:Gates Open'); // the always-present anchor event
    expect(body).toContain('X-WR-CALNAME:@alice — Pickathon Picks');
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('a freshly minted token serves immediately — there is no cache to wait for', async () => {
    // The whole point of reading at request time: the token the client just wrote
    // resolves on the very next refresh, with no tick in between.
    feedOk();
    const ctx = mkDb(DB_DOCS);
    await ctx.db.put({
      _id: 'caltoken-zoe',
      type: 'caltoken',
      userId: 'zoe',
      token: 'zoe-token-1234567890ZZ',
    });
    await ctx.db.put({ _id: 'favorite-zoe-102', type: 'favorite', userId: 'zoe', eventId: 102 });
    const body = await (await icsFetch(req('/faves.ics?t=zoe-token-1234567890ZZ'), ctx)).text();
    expect(body).toContain('SUMMARY:Skills & Games');
    expect(body).toContain('X-WR-CALNAME:@zoe — Pickathon Picks');
  });

  it('serves fave-less and unknown tokens alike: valid anchor-only, never an error', async () => {
    feedOk();
    const url = '/faves.ics?t=freshly-minted-token-000&n=jchris';
    const res = await icsFetch(req(url), mkDb(DB_DOCS));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); // don't pin the placeholder
    const body = await res.text();
    expect(body).toContain('SUMMARY:Gates Open');
    // iOS captures the calendar name at subscribe time; the display-only n=
    // param names it correctly even for a token this db has never seen.
    expect(body).toContain('X-WR-CALNAME:@jchris — Pickathon Picks');
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  it('derives legacy shift times from day + startTime/endTime', async () => {
    feedOk();
    const body = await (await icsFetch(req(`/faves.ics?t=${T_BOB}`), mkDb(DB_DOCS))).text();
    expect(body).toContain('SUMMARY:Gate');
    expect(body).toContain('DTSTART:20260731T170000Z'); // Friday 10:00 PDT
  });

  it('400s a missing or malformed token', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
    expect((await icsFetch(req('/faves.ics'), ctx)).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=short'), ctx)).status).toBe(400);
    expect((await icsFetch(req('/faves.ics?t=bad$token!!!!!!!!!!!'), ctx)).status).toBe(400);
  });

  it('the GET path makes ZERO egress — the schedule comes from mirrored docs', async () => {
    // Pin the whole point of the change: a GET must never touch the festival site.
    // The spy THROWS, so a regression that reintroduces a per-request fetch both
    // trips `not.toHaveBeenCalled` and fails the events out of the body.
    const fetchSpy = vi.fn(async () => {
      throw new Error('no egress allowed on the GET path');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), mkDb(DB_DOCS));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('SUMMARY:Built to Spill'); // 101, from the mirror
    expect(body).toContain('SUMMARY:Night Act'); // 201, from the mirror
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('omits a fave whose scheduleitem doc the mirror has not captured — 200, not 502', async () => {
    feedOk();
    // alice faves 101 and 201; drop 201's mirror doc. Eventual consistency: 201
    // is simply absent from the feed, the rest still serves.
    const docs = DB_DOCS.filter((d) => d._id !== 'schedule-event-201');
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), mkDb(docs));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('SUMMARY:Built to Spill'); // 101 resolved
    expect(body).not.toContain('SUMMARY:Night Act'); // 201 omitted, not an error
    expect(body).toContain('SUMMARY:Gates Open'); // anchor always present
  });

  it('502s a FAILED scheduleitem read — never an empty "picks gone" calendar', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
    const realGet = ctx.db.get;
    ctx.db.get = async (id, opts) => {
      if (typeof id === 'string' && id.startsWith('schedule-event-')) {
        throw new Error('Access denied');
      }
      return realGet(id, opts);
    };
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
    expect(res.status).toBe(502);
  });

  it('502s a FAILED db read — never an empty calendar that reads as "picks gone"', async () => {
    feedOk();
    const broken = {
      db: {
        query: async () => {
          throw new Error('Access denied');
        },
      },
    };
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), broken);
    expect(res.status).toBe(502);
  });

  it("shifts don't touch the feed: a shifts-only user serves without egress", async () => {
    const fetchSpy = feedOk();
    const res = await icsFetch(
      req(`/faves.ics?t=${T_ALICE}`),
      mkDb([DB_DOCS[3], DB_DOCS[7]]) // one shared shift + alice's token
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await res.text()).toContain('SUMMARY:Volunteer');
  });

  it('reads only the caltoken id-block to resolve a token, not the whole db', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
    await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
    // The token walk starts AT the prefix and stops at the first id past the
    // block — it never asks for a page from the top of the db.
    expect(ctx.queries[0]).toMatchObject({ after: 'caltoken-', limit: 500 });
    expect(ctx.queries[0].field).toBeUndefined();
  });
});

describe('fetchScheduleItems — projects mirrored scheduleitem docs, no egress', () => {
  it('maps title/start/end/venueTitle→location/url and keeps the event-<id> id shape', async () => {
    const ctx = mkDb(SCHEDULE_DOCS);
    const items = await fetchScheduleItems(ctx, ['101', '102']);
    expect(items).toEqual([
      {
        id: 'event-101',
        title: 'Built to Spill',
        start: '2026-07-31T13:00:00',
        end: '2026-07-31T14:00:00',
        location: 'Woods Stage',
        url: 'https://example.com/a',
      },
      {
        id: 'event-102',
        title: 'Skills & Games',
        start: '2026-08-01T11:00:00',
        end: '2026-08-01T12:00:00',
        location: 'Woods Stage',
      },
    ]);
    // The doc's own _id is schedule-event-<id>; the .ics id stays event-<id>.
    expect(scheduleItemId('101')).toBe('schedule-event-101');
  });

  it('omits ids with no mirrored doc rather than failing', async () => {
    const ctx = mkDb(SCHEDULE_DOCS);
    const items = await fetchScheduleItems(ctx, ['101', '999']);
    expect(items.map((i) => i.id)).toEqual(['event-101']);
  });

  it('propagates a db.get failure so the caller can 502', async () => {
    const ctx = mkDb(SCHEDULE_DOCS);
    ctx.db.get = async () => {
      throw new Error('Access denied');
    };
    await expect(fetchScheduleItems(ctx, ['101'])).rejects.toThrow('Access denied');
  });
});

// ── #4507: the feed a late-alphabet handle actually gets ─────────────────────
// The old design aggregated the whole db in one capped read, so with 2,442 docs
// sorting ahead of `favorite-jchris-*` that user's feed served anchor-only — no
// error, no signal, ~43% of users affected. Both halves of the fix are pinned
// here: the read is KEYED (so it isn't a whole-db scan), and it PAGES on `next`
// (so nothing is lost to the cut).
describe('a big db: the late-alphabet handle must get a complete feed', () => {
  afterEach(() => vi.unstubAllGlobals());
  // 2,500 other users' favorites, all sorting BEFORE `favorite-zoe-*` and before
  // the target's shifts — more than one full host page of them.
  const filler = Array.from({ length: 2500 }, (_, i) => ({
    _id: `favorite-user${String(i).padStart(5, '0')}-101`,
    type: 'favorite',
    userId: `user${i}`,
    eventId: 101,
  }));
  const zoe = [
    { _id: 'caltoken-zoe', type: 'caltoken', userId: 'zoe', token: 'zoe-token-1234567890ZZ' },
    { _id: 'favorite-zoe-102', type: 'favorite', userId: 'zoe', eventId: 102 },
    { _id: 'favorite-zoe-201', type: 'favorite', userId: 'zoe', eventId: 201 },
  ];
  const T_ZOE = 'zoe-token-1234567890ZZ';

  it('serves every pick even when 2,500 docs sort ahead of them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }))
    );
    const ctx = mkDb([...filler, ...zoe, ...SCHEDULE_DOCS]);
    const res = await icsFetch(req(`/faves.ics?t=${T_ZOE}`), ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('SUMMARY:Skills & Games'); // 102
    expect(body).toContain('SUMMARY:Night Act'); // 201
    expect(body).toContain('X-WR-CALNAME:@zoe — Pickathon Picks');
    // It really did have to paginate: the keyed read's FIRST page is all filler
    // and filters down to nothing, and stopping there is the silent-loss bug.
    const userQueries = ctx.queries.filter((q) => q.field === 'userId');
    expect(userQueries.length).toBeGreaterThan(1);
  });

  it('resolves a token whose caltoken block spans several pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FEED), { status: 200 }))
    );
    const manyTokens = Array.from({ length: 1200 }, (_, i) => ({
      _id: `caltoken-user${String(i).padStart(5, '0')}`,
      type: 'caltoken',
      userId: `user${i}`,
      token: `tok-${String(i).padStart(5, '0')}-abcdefghij`,
    }));
    const ctx = mkDb([...manyTokens, ...filler, ...zoe, ...SCHEDULE_DOCS]);
    const body = await (await icsFetch(req(`/faves.ics?t=${T_ZOE}`), ctx)).text();
    expect(body).toContain('SUMMARY:Skills & Games');
  });

  it('a page that filters down to EMPTY still carries a cursor (the #4398 caveat)', async () => {
    // Pinning the host contract this file depends on, in the fake: emptiness is
    // not the end of the read — a missing `next` is.
    const ctx = mkDb([...filler, ...zoe]);
    // Start inside the filler block, so the whole page belongs to other users.
    const page = await ctx.db.query({
      db: BACKEND_DB,
      field: 'userId',
      keys: ['zoe'],
      after: 'favorite-',
    });
    expect(page.length).toBe(0);
    expect(page.next).toBeDefined();
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
      `attachment; filename="${ICS_SLUG}-faves.ics"`
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
// The tick used to read the whole db, and once that read hit the host's page cap
// the mirror's own docs fell outside it: the diff read "nothing is mirrored" and
// re-put all ~330 events every 60 seconds, pinning the Durable Object at 97%
// occupancy. These tests pin the shape that fixed it — the mirror decides
// "unchanged" from its own state doc, read by id, so a steady schedule costs
// ZERO writes at any db size.
describe('schedule mirror — unchanged schedule must cost zero writes', () => {
  beforeEach(() => {
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
  // Successive ticks, SCHEDULE_SYNC_INTERVAL_MS apart so each one is due.
  const at = (n) => ({ scheduledTime: new Date(1e12 + n * SCHEDULE_SYNC_INTERVAL_MS).toISOString() });

  it('never reads the whole db — every tick read is a point get', async () => {
    // The tick's whole-db query is what #4293 rode in on, and it is gone. If this
    // fails, something re-introduced a scan on the 1-minute lane.
    feedOk();
    const ctx = mkDb(DB_DOCS);
    await scheduled(at(0), ctx);
    expect(ctx.queries).toEqual([]);
  });

  it('mirrors the feed on the first sync and records a fingerprint per event', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
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
    const ctx = mkDb(DB_DOCS);
    await scheduled(at(0), ctx);
    const afterFirst = ctx.puts.length;
    await scheduled(at(1), ctx);
    await scheduled(at(2), ctx);
    expect(ctx.puts.length).toBe(afterFirst);
    expect(ctx.deletes).toEqual([]);
  });

  it('stays quiet without ever looking at a scheduleitem doc', async () => {
    // The diff comes from the state doc alone: a store holding the state doc and
    // NO mirror docs must still write nothing. (This is prod's exact shape from
    // the era when the mirror docs sorted past the read cap.)
    feedOk();
    const seed = mkDb(DB_DOCS);
    await scheduled(at(0), seed);
    const state = seed.puts.find((d) => d._id === SCHEDULE_STATE_ID);
    const noMirror = mkDb([...DB_DOCS, state]);
    await scheduled(at(1), noMirror);
    expect(noMirror.puts).toEqual([]);
    expect(noMirror.deletes).toEqual([]);
  });

  it('falls back to the in-isolate copy when the state doc goes missing', async () => {
    // Losing the state doc — deleted, or swept by an ops mistake — must NOT read
    // as "nothing is mirrored"; that belief is the rewrite storm.
    feedOk();
    const ctx = mkDb(DB_DOCS);
    await scheduled(at(0), ctx);
    ctx.puts.length = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ctx.db.delete(SCHEDULE_STATE_ID);
    ctx.deletes.length = 0;
    await scheduled(at(1), ctx); // same isolate
    expect(ctx.puts).toEqual([]); // the isolate remembered — no rewrite storm
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
    warn.mockRestore();
  });

  it('re-puts ONLY the event whose content changed', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
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
    const ctx = mkDb(DB_DOCS);
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
    const ctx = mkDb(DB_DOCS);
    await scheduled(at(0), ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    await scheduled({ scheduledTime: new Date(1e12 + 60_000).toISOString() }, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed or empty feed writes nothing and retries on the next tick', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const ctx = mkDb(DB_DOCS);
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
    const ctx = mkDb([
      ...DB_DOCS,
      { _id: SCHEDULE_STATE_ID, type: SCHEDULE_STATE_TYPE, fingerprints: 'not-an-object' },
    ]);
    await scheduled(at(0), ctx);
    expect(ctx.puts.filter((d) => d.type === 'scheduleitem').length).toBe(3);
  });
});

describe('tick liveness heartbeat — the only durable proof the alarm ran', () => {
  beforeEach(() => {
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

  const beats = (ctx) => ctx.puts.filter((d) => d.type === HEARTBEAT_TYPE);
  const tick = (ms) => ({ scheduledTime: new Date(ms).toISOString() });
  const T0 = 1e12;

  it('stamps the tick’s scheduled time on a cold isolate with no doc to go by', async () => {
    const ctx = mkDb([]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toEqual([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0).toISOString() },
    ]);
  });

  it('beats at most once an hour — a 1m tick must not mint a write a minute', async () => {
    const ctx = mkDb([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + 60_000), ctx);
    await scheduled(tick(T0 + HEARTBEAT_INTERVAL_MS - 1000), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('re-beats once the interval elapses, with a CHANGED stamp (or the platform dedupes it)', async () => {
    const ctx = mkDb([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + HEARTBEAT_INTERVAL_MS), ctx);
    const stamps = beats(ctx).map((d) => d.at);
    expect(stamps).toHaveLength(2);
    expect(stamps[0]).not.toBe(stamps[1]);
  });

  it('honours a recent heartbeat doc after an isolate restart', async () => {
    // Fresh isolate (no memory), but the doc is one point read away.
    const ctx = mkDb([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0 - 60_000).toISOString() },
    ]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toEqual([]);
  });

  it('beats when the stored stamp is stale — a dead-then-revived alarm says so', async () => {
    const ctx = mkDb([
      { _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: new Date(T0 - 3 * 60 * 60 * 1000).toISOString() },
    ]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('a doc that disappears means "don’t know", never "never beat"', async () => {
    const ctx = mkDb([]);
    await scheduled(tick(T0), ctx);
    await scheduled(tick(T0 + 60_000), mkDb([])); // same isolate, doc absent
    expect(beats(ctx)).toHaveLength(1);
  });

  it('treats an unparseable stamp as no evidence and beats now', async () => {
    const ctx = mkDb([{ _id: HEARTBEAT_ID, type: HEARTBEAT_TYPE, at: 'not-a-date' }]);
    await scheduled(tick(T0), ctx);
    expect(beats(ctx)).toHaveLength(1);
  });

  it('writes nothing on a read-only ctx', async () => {
    await expect(scheduled(tick(T0), { db: { get: async () => null } })).resolves.not.toThrow();
  });
});

describe('load shedding — the owner-flipped config doc', () => {
  beforeEach(() => {
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
  const at = (n) => ({ scheduledTime: new Date(1e12 + n * SCHEDULE_SYNC_INTERVAL_MS).toISOString() });

  it('serves the subscription normally when the doc is absent (fail-open)', async () => {
    feedOk();
    const ctx = mkDb(DB_DOCS);
    await scheduled(at(0), ctx);
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUMMARY:Built to Spill');
  });

  it('serves normally when the level is off or unrecognized (a typo must not shed)', async () => {
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('off')]);
    await scheduled(at(0), ctx);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx)).status).toBe(200);
    const typo = mkDb([...DB_DOCS, shedDoc('readonly')]); // fat-fingered
    await scheduled(at(1), typo);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), typo)).status).toBe(200);
  });

  it('503s the subscription lane with a retry-after while shedding, in BOTH shed levels', async () => {
    // Calendar clients retry a 503 gracefully and keep the events they already
    // synced — which is why this is a 503 and not an empty calendar.
    for (const level of ['read-only', 'schedule-only']) {
      __resetShedForTests();
      feedOk();
      const ctx = mkDb([...DB_DOCS, shedDoc(level)]);
      await scheduled(at(0), ctx);
      const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
      expect(res.status).toBe(503);
      expect(res.headers.get('retry-after')).toBe(String(SHED_RETRY_AFTER_SECONDS));
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.text();
      expect(body).toMatch(/festival/i); // calm, and says it comes back
      expect(body).not.toMatch(/error|lost|deleted/i);
    }
  });

  it('sheds BEFORE reading the db — that is the saving', async () => {
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    ctx.queries.length = 0;
    await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
    expect(ctx.queries).toEqual([]);
  });

  it('a malformed token still 400s before the shed check (shedding is not a bug bucket)', async () => {
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    expect((await icsFetch(req('/faves.ics?t=short'), ctx)).status).toBe(400);
  });

  it('still writes the heartbeat while shedding', async () => {
    // Liveness must survive shedding: a shed tick is still a tick that ran, and
    // the heartbeat is the only durable evidence of that (#4305).
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    expect(ctx.puts.filter((d) => d.type === HEARTBEAT_TYPE)).toHaveLength(1);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx)).status).toBe(503);
  });

  it('keeps the 5-minute schedule mirror running in BOTH shed levels', async () => {
    // Shedding targets viewer-driven amplification, not the fixed-cost mirror —
    // and the schedule staying fresh is the whole point of staying up.
    for (const level of ['read-only', 'schedule-only']) {
      __resetShedForTests();
      __resetScheduleSyncForTests();
      feedOk();
      const ctx = mkDb([...DB_DOCS, shedDoc(level)]);
      await scheduled(at(0), ctx);
      expect(ctx.puts.filter((d) => d.type === 'scheduleitem').length).toBe(3);
      expect(ctx.puts.some((d) => d._id === SCHEDULE_STATE_ID)).toBe(true);
    }
  });

  it('honours the in-isolate copy when the doc is deleted under it', async () => {
    // Deleting the doc must not read as "shedding is off" — that would re-open
    // the very load spike the switch was flipped for. `level:"off"` lifts it.
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ctx.db.delete(LOADSHED_ID);
    await scheduled(at(1), ctx);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx)).status).toBe(503);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(LOADSHED_ID));
    warn.mockRestore();
  });

  it('lifts the shed as soon as the doc says off', async () => {
    feedOk();
    const ctx = mkDb([...DB_DOCS, shedDoc('read-only')]);
    await scheduled(at(0), ctx);
    expect((await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx)).status).toBe(503);
    await ctx.db.put(shedDoc('off'));
    await scheduled(at(1), ctx);
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SUMMARY:Built to Spill');
  });

  it('a cold isolate that has never seen the doc serves normally (fail-open)', async () => {
    feedOk();
    const res = await icsFetch(req(`/faves.ics?t=${T_ALICE}`), mkDb(DB_DOCS));
    expect(res.status).toBe(200);
  });
});
